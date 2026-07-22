/**
 * Message Router Module
 * Handles: Message IDs, Duplicate Suppression, TTL, Peer Relay Forwarding
 */

// ==================== MESSAGE ID GENERATOR ====================
function generateMessageId() {
  // UUID v4-like ID: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `msg_${timestamp}_${random}`;
}

// ==================== MESSAGE CACHE (Duplicate Suppression) ====================
class MessageCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Check if message ID was already processed
   */
  isDuplicate(messageId) {
    return this.cache.has(messageId);
  }

  /**
   * Add message ID to cache (mark as processed)
   */
  add(messageId) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (FIFO)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(messageId, Date.now());
  }

  /**
   * Clean old entries (older than TTL)
   */
  cleanup(ttlMs = 300000) { // 5 minutes default
    const now = Date.now();
    for (const [msgId, timestamp] of this.cache.entries()) {
      if (now - timestamp > ttlMs) {
        this.cache.delete(msgId);
      }
    }
  }
}

// ==================== MESSAGE ROUTER ====================
class MessageRouter {
  constructor(myUsername) {
    this.myUsername = myUsername;
    this.messageCache = new MessageCache();
    this.routingTable = new Map(); // Track message paths
    this.defaultTtl = 300; // 5 minutes in seconds
    
    // Cleanup cache every 60 seconds
    setInterval(() => this.messageCache.cleanup(), 60000);
  }

  /**
   * Create a routable message with all metadata
   */
  createMessage(to, content, options = {}) {
    return {
      id: generateMessageId(),
      from: this.myUsername,
      to: to,
      content: content,
      timestamp: Math.floor(Date.now() / 1000),
      ttl: options.ttl || this.defaultTtl,
      path: [this.myUsername], // Track hops
      encrypted: options.encrypted || false,
      priority: options.priority || 'normal'
    };
  }

  /**
   * Validate message before processing
   */
  validateMessage(msg) {
    // Check required fields
    if (!msg.id || !msg.from || !msg.to || msg.timestamp === undefined || msg.ttl === undefined) {
      return { valid: false, reason: 'Missing required fields' };
    }

    // Check for duplicates
    if (this.messageCache.isDuplicate(msg.id)) {
      return { valid: false, reason: 'Duplicate message' };
    }

    // Check TTL (is message expired?)
    const age = Math.floor(Date.now() / 1000) - msg.timestamp;
    if (age > msg.ttl) {
      return { valid: false, reason: 'Message TTL expired' };
    }

    // Check for routing loops (message visiting same peer twice)
    if (msg.path && msg.path.length > 0) {
      const pathSet = new Set(msg.path);
      if (pathSet.size !== msg.path.length) {
        return { valid: false, reason: 'Routing loop detected' };
      }
      // Limit hops to prevent infinite forwarding
      if (msg.path.length > 10) {
        return { valid: false, reason: 'Max hops exceeded' };
      }
    }

    return { valid: true };
  }

  /**
   * Process incoming message
   */
  processMessage(msg) {
    // Validate
    const validation = this.validateMessage(msg);
    if (!validation.valid) {
      console.warn(`[MessageRouter] Invalid message: ${validation.reason}`);
      return { processed: false, reason: validation.reason };
    }

    // Mark as processed (duplicate suppression)
    this.messageCache.add(msg.id);

    // Check if we're the final recipient
    const isForUs = msg.to === this.myUsername;
    if (isForUs) {
      console.log(`[MessageRouter] Message ${msg.id} delivered`);
      return { processed: true, forUs: true, message: msg };
    }

    // We're not the recipient - should we relay?
    return { processed: true, forUs: false, message: msg };
  }

  /**
   * Add this peer to message path (before relaying)
   */
  addToPath(msg) {
    if (!msg.path) {
      msg.path = [];
    }
    if (!msg.path.includes(this.myUsername)) {
      msg.path.push(this.myUsername);
    }
    return msg;
  }

  /**
   * Get message age in seconds
   */
  getMessageAge(msg) {
    return Math.floor(Date.now() / 1000) - msg.timestamp;
  }

  /**
   * Get remaining TTL in seconds
   */
  getRemainingTtl(msg) {
    const age = this.getMessageAge(msg);
    return Math.max(0, msg.ttl - age);
  }

  /**
   * Format message for logging
   */
  formatMessage(msg) {
    return {
      id: msg.id,
      from: msg.from,
      to: msg.to,
      path: msg.path.join(' -> '),
      age: this.getMessageAge(msg),
      ttl: this.getRemainingTtl(msg),
      hops: msg.path.length
    };
  }
}

// ==================== RELAY FORWARDING ====================
class RelayForwarder {
  constructor(messageRouter, peers, ws) {
    this.messageRouter = messageRouter;
    this.peers = peers; // Connected peers map
    this.ws = ws; // WebSocket for relay through server
    this.relayCache = new Map(); // Track relayed messages
  }

  /**
   * Find best route to deliver message
   */
  findRoute(destinationUsername, onlinePeers) {
    // Direct peer available?
    if (onlinePeers.includes(destinationUsername)) {
      return { route: 'direct', target: destinationUsername };
    }

    // Try relay through connected peers
    const connectedPeersList = Object.keys(this.peers).filter(p => this.peers[p].connected);
    if (connectedPeersList.length > 0) {
      return { route: 'relay', targets: connectedPeersList };
    }

    // Fall back to server relay
    return { route: 'server', target: null };
  }

  /**
   * Relay message to other peers
   */
  relayMessage(msg, connectedPeers) {
    const relayId = `${msg.id}_relay`;
    
    // Don't relay same message twice
    if (this.relayCache.has(relayId)) {
      return { success: false, reason: 'Already relayed' };
    }

    this.relayCache.set(relayId, Date.now());

    // Add ourselves to path
    this.messageRouter.addToPath(msg);

    // Send to each connected peer
    const results = [];
    for (const peername in this.peers) {
      const peer = this.peers[peername];
      if (peer.connected && peer.dc && peer.dc.readyState === 'open') {
        try {
          peer.dc.send(JSON.stringify({
            type: 'routed_message',
            payload: msg
          }));
          results.push({ peer: peername, success: true });
        } catch (e) {
          results.push({ peer: peername, success: false, error: e.message });
        }
      }
    }

    return { success: true, relayed: results };
  }

  /**
   * Request server to relay message (if direct/peer relay unavailable)
   */
  requestServerRelay(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, reason: 'WebSocket not connected' };
    }

    this.messageRouter.addToPath(msg);

    this.ws.send(JSON.stringify({
      type: 'relay_message',
      payload: msg
    }));

    return { success: true, method: 'server_relay' };
  }

  /**
   * Clean old relay entries
   */
  cleanup(maxAge = 600000) { // 10 minutes
    const now = Date.now();
    for (const [relayId, timestamp] of this.relayCache.entries()) {
      if (now - timestamp > maxAge) {
        this.relayCache.delete(relayId);
      }
    }
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MessageRouter, RelayForwarder, MessageCache, generateMessageId };
}
