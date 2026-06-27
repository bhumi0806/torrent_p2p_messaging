/**
 * INTEGRATION GUIDE: Message Routing
 * 
 * Shows how to integrate Message IDs, Duplicate Suppression, TTL, 
 * and Peer Relay Forwarding into app.js
 */

// ===== ADD THESE AT TOP OF app.js =====

// Import message router (add to imports)
// <script src="messageRouter.js"></script>

let messageRouter;      // Instance of MessageRouter
let relayForwarder;     // Instance of RelayForwarder

// ===== INITIALIZE IN CONNECTION SETUP =====

async function initializeMessageRouting() {
  if (!myUsername) return;
  
  messageRouter = new MessageRouter(myUsername);
  relayForwarder = new RelayForwarder(messageRouter, peers, ws);
  
  console.log(`[Message Routing] Initialized for user: ${myUsername}`);
}

// Call this when user connects
// Add to your login handler after username is set:
// await initializeMessageRouting();


// ===== SENDING MESSAGES WITH ROUTING =====

function sendRoutedMessage(toPeer, content) {
  if (!messageRouter) {
    console.error("Message router not initialized");
    return;
  }

  // Create routable message
  const msg = messageRouter.createMessage(toPeer, content, {
    ttl: 300,        // 5 minutes
    encrypted: false
  });

  console.log(`[Send] Message ${msg.id} to ${toPeer}`);
  console.log(`[Send] TTL: ${msg.ttl}s, Path: ${msg.path.join(' -> ')}`);

  // Try to send through connected peer
  if (peers[toPeer] && peers[toPeer].dc && peers[toPeer].dc.readyState === 'open') {
    peers[toPeer].dc.send(JSON.stringify({
      type: 'routed_message',
      payload: msg
    }));
    return;
  }

  // Peer not connected - try relay
  console.log(`[Relay] ${toPeer} not directly connected, attempting relay...`);
  const result = relayForwarder.relayMessage(msg, Object.keys(peers));
  console.log(`[Relay] Result:`, result);
}


// ===== RECEIVING & PROCESSING MESSAGES =====

async function handleRoutedMessage(incomingMsg) {
  if (!messageRouter) return;

  console.log(`[Receive] Got message ${incomingMsg.id}`);

  // Validate and process
  const result = messageRouter.processMessage(incomingMsg);

  if (!result.processed) {
    console.warn(`[Receive] Message rejected: ${result.reason}`);
    return;
  }

  // Message is for us
  if (result.forUs) {
    console.log(`[Receive] Message delivered to us from ${incomingMsg.from}`);
    console.log(`[Receive] Content: ${incomingMsg.content}`);
    console.log(`[Receive] Path: ${incomingMsg.path.join(' -> ')}`);
    console.log(`[Receive] TTL Remaining: ${messageRouter.getRemainingTtl(incomingMsg)}s`);
    
    // Display in UI
    log(`${incomingMsg.from}: ${incomingMsg.content} [TTL: ${messageRouter.getRemainingTtl(incomingMsg)}s]`);
    return;
  }

  // Message is NOT for us - should we relay?
  console.log(`[Relay] Message not for us, forwarding to destination ${incomingMsg.to}`);
  const relayResult = relayForwarder.relayMessage(incomingMsg, Object.keys(peers));
  console.log(`[Relay] Forwarded:`, relayResult);
}


// ===== UPDATE setupDataChannel TO HANDLE ROUTED MESSAGES =====

function setupDataChannelWithRouting(username, peer, channel) {
  channel.binaryType = "arraybuffer";

  channel.onopen = async () => {
    log("P2P Connected to " + username);
    peer.connected = true;
    updateConnectedPeers();
    await startHandshake(username);
  };

  channel.onmessage = async (ev) => {
    const data = ev.data;
    
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        
        // Handle handshake messages
        if (msg.hs || msg.type === 'handshake') {
          await onHandshakeMessage(msg, username);
          return;
        }
        
        // Handle routed messages
        if (msg.type === 'routed_message') {
          await handleRoutedMessage(msg.payload);
          return;
        }
        
        // Legacy message handling
        log(`${username}: ${data}`);
      } catch (e) {
        console.error("Error parsing message:", e);
      }
      return;
    }

    // Handle encrypted packets
    const bytes = new Uint8Array(data);
    await onEncryptedPacket(bytes, username);
  };

  channel.onclose = () => {
    log("Disconnected from " + username);
    delete peers[username];
    updateConnectedPeers();
  };
}


// ===== MONITORING MESSAGE ROUTING =====

function showMessageStats() {
  if (!messageRouter) {
    console.log("Message router not initialized");
    return;
  }

  const stats = {
    messagesProcessed: messageRouter.messageCache.cache.size,
    maxCacheSize: messageRouter.messageCache.maxSize,
    defaultTtl: messageRouter.defaultTtl,
    connectedPeers: Object.keys(peers).filter(p => peers[p].connected).length
  };

  console.table(stats);
  
  return stats;
}

function showRelayStats() {
  if (!relayForwarder) {
    console.log("Relay forwarder not initialized");
    return;
  }

  const stats = {
    cachedRelays: relayForwarder.relayCache.size,
    connectedPeers: Object.keys(peers).length
  };

  console.table(stats);
  return stats;
}


// ===== EXAMPLE: SEND MESSAGE WITH UI =====

function setupSendButton() {
  const sendBtn = document.getElementById("sendBtn");
  const msgInput = document.getElementById("msgInput");
  const peerSelect = document.getElementById("peerSelect");

  if (!sendBtn || !msgInput) return;

  sendBtn.onclick = () => {
    const content = msgInput.value;
    const toPeer = peerSelect ? peerSelect.value : peerUsername;

    if (!content || !toPeer) {
      alert("Enter message and select peer");
      return;
    }

    // Send routed message
    sendRoutedMessage(toPeer, content);
    msgInput.value = "";
  };
}


// ===== PERIODIC CLEANUP =====

function startRoutingCleanup() {
  // Cleanup relay cache every 10 minutes
  setInterval(() => {
    if (!relayForwarder) return;
    const cleaned = relayForwarder.cleanup();
    if (cleaned > 0) {
      console.log(`[Cleanup] Removed ${cleaned} old relay entries`);
    }
  }, 600000);
}


// ===== CALL THESE WHEN INITIALIZING =====

// Add to your main connection handler:
/*
async function handleConnectionEstablished() {
  await initializeMessageRouting();
  setupSendButton();
  startRoutingCleanup();
}
*/
