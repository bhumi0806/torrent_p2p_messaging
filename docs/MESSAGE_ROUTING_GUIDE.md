# Message Routing Implementation Guide

## Overview

This guide covers implementing 4 key message routing features in your P2P messaging system:

1. **Message IDs** - Unique identification for each message
2. **Duplicate Suppression** - Prevent processing the same message twice
3. **TTL (Time To Live)** - Expire old messages automatically
4. **Peer Relay Forwarding** - Route messages through intermediate peers

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         MESSAGE ROUTING SYSTEM                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CLIENT A             SIGNALING SERVER           CLIENT B        │
│  ┌─────────┐          ┌──────────┐             ┌─────────┐      │
│  │MessageID│◄────────►│Message   │◄───────────►│MessageID│      │
│  │Generator│          │Router    │             │Generator│      │
│  ├─────────┤          ├──────────┤             ├─────────┤      │
│  │TTL      │          │RelayFwd  │             │TTL      │      │
│  ├─────────┤          ├──────────┤             ├─────────┤      │
│  │Dup Cache│          │MsgQueue  │             │Dup Cache│      │
│  ├─────────┤          ├──────────┤             ├─────────┤      │
│  │Relay    │          │Path Track│             │Relay    │      │
│  └────┬────┘          └────┬─────┘             └────┬────┘      │
│       │                    │                        │            │
│       └────────────────────┼────────────────────────┘            │
│              WebRTC + WebSocket                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Feature Details

### 1. Message IDs

**Purpose**: Uniquely identify each message in the network

**Implementation**:
```javascript
function generateMessageId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `msg_${timestamp}_${random}`;
}
```

**Message Structure**:
```javascript
{
  id: "msg_1jkf9km_a1b2c3d",      // Unique identifier
  from: "alice",
  to: "bob",
  content: "Hello Bob",
  timestamp: 1718127600,           // Unix timestamp
  ttl: 300,                        // Time to live in seconds
  path: ["alice"],                 // Route taken
  encrypted: false,
  priority: "normal"
}
```

**Benefits**:
- Track message delivery
- Enable delivery confirmations
- Foundation for deduplication

---

### 2. Duplicate Suppression

**Purpose**: Prevent processing the same message multiple times

**Problem Scenario**:
```
Alice → Server → Bob
         ↓
       (forwards to relay peer)
         ↓
Bob receives message from Alice directly AND from relay
= Message processed TWICE = BAD
```

**Solution - Message Cache**:
```javascript
class MessageCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();  // {messageId: timestamp}
    this.maxSize = maxSize;
  }

  isDuplicate(messageId) {
    return this.cache.has(messageId);
  }

  add(messageId) {
    // If cache full, remove oldest entry (FIFO)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(messageId, Date.now());
  }
}
```

**When It Activates**:
1. Message arrives at peer
2. Check: `isDuplicate(msg.id)`?
3. If YES → Drop it (duplicate)
4. If NO → Process & add to cache

---

### 3. TTL (Time To Live)

**Purpose**: Automatically expire old messages

**Problem Scenario**:
```
Message sent from Alice at 12:00:00 with TTL=300s
↓
Alice offline, message queued
↓
At 12:10:00 (600s later), message still alive?
Should be dropped - too old!
```

**Solution - TTL Validation**:
```javascript
validateMessage(msg) {
  const age = Math.floor(Date.now() / 1000) - msg.timestamp;
  
  if (age > msg.ttl) {
    return { valid: false, reason: 'Message TTL expired' };
  }
  
  return { valid: true };
}
```

**Usage**:
```javascript
// Create message with 5 minute TTL
const msg = messageRouter.createMessage(
  "bob",
  "Hello",
  { ttl: 300 }  // 300 seconds
);

// Check remaining TTL
const remaining = messageRouter.getRemainingTtl(msg);
console.log(`Message valid for ${remaining} more seconds`);
```

**Why It Matters**:
- Prevents stale message delivery
- Limits network resource usage
- Prevents infinite message loops
- Configurable per message

**Typical TTL Values**:
- Urgent messages: 60s (1 minute)
- Normal messages: 300s (5 minutes)
- Bulk data: 600s (10 minutes)

---

### 4. Peer Relay Forwarding

**Purpose**: Route messages through intermediate peers

**Scenarios**:

**Scenario 1: Direct Delivery**
```
Alice ──(direct P2P)──► Bob
```

**Scenario 2: Relay Delivery**
```
Alice ──► Carol ──► Bob
        (relay)
Carol forwards message to Bob
```

**Scenario 3: Server Queue**
```
Alice ──► Server ──(queue)──► Bob comes online
                     ↓
                  [stored]
                     ↓
              Delivered on login
```

**Implementation**:
```javascript
class RelayForwarder {
  findRoute(destinationUsername, onlinePeers) {
    // Try 1: Direct peer
    if (onlinePeers.includes(destinationUsername)) {
      return { route: 'direct', target: destinationUsername };
    }

    // Try 2: Relay through connected peers
    const connectedPeers = Object.keys(this.peers)
      .filter(p => this.peers[p].connected);
    
    if (connectedPeers.length > 0) {
      return { route: 'relay', targets: connectedPeers };
    }

    // Try 3: Server queue
    return { route: 'server', target: null };
  }

  relayMessage(msg, connectedPeers) {
    // Add ourselves to path
    this.messageRouter.addToPath(msg);

    // Send to each connected peer
    for (const peername in this.peers) {
      if (this.peers[peername].connected) {
        this.peers[peername].dc.send(
          JSON.stringify({
            type: 'routed_message',
            payload: msg
          })
        );
      }
    }
  }
}
```

**Path Tracking**:
```javascript
// Message path shows how it traveled:
msg.path = ["alice", "carol", "server", "bob"]
           ↑       ↑       ↑         ↑
           │       │       │         └─ Final destination
           │       │       └─ Relayed through server
           │       └─ Relayed through Carol
           └─ Original sender
```

**Loop Prevention**:
```javascript
// Check for routing loops
if (msg.path.length !== new Set(msg.path).length) {
  return { valid: false, reason: 'Routing loop detected' };
}

// Limit hops
if (msg.path.length > 10) {
  return { valid: false, reason: 'Max hops exceeded' };
}
```

---

## Data Flow Examples

### Example 1: Simple Message Delivery

```
CLIENT A (Alice)              SIGNALING SERVER           CLIENT B (Bob)
        │                              │                        │
        │ 1. Login                     │                        │
        ├─────────────────────────────►│                        │
        │                              │                        │
        │                              │ 2. User List           │
        │                              │◄───────────────────────┤
        │                              │                        │
        │ 3. Send Message (Direct)     │                        │
        │    {id: msg_123, to: bob}   │                        │
        ├──────────────────────────────┤                        │
        │                (WebRTC P2P)  │                        │
        ├─────────────────────────────────────────────────────► │
        │                              │                        │
        │                              │ 4. Receive Message     │
        │                              │    Check: Is duplicate?│
        │                              │    Check: Is expired?  │
        │                              │    → Process           │
        │                              │    → Add to cache      │
        │                              │                        │
```

### Example 2: Relay Delivery (Offline Recipient)

```
CLIENT A (Alice)              SIGNALING SERVER           CLIENT C (Carol)
        │                              │                        │
        │ 1. Send Message              │                        │
        │    {id: msg_123, to: bob}   │                        │
        ├─────────────────────────────►│                        │
        │                              │ 2. Bob offline?        │
        │                              │    → Find route        │
        │                              │    → Queue for relay   │
        │                              │                        │
        │                              │ 3. Relay Request       │
        │                              ├──────────────────────► │
        │                              │                        │
        │                              │ 4. Carol relays to Bob │
        │                              │    path += "carol"     │
        │                              │                        │
        │                              ▼                        │
        │                       [server queue]                  │
        │                              ▼                        │
        │                         BOB LOGS IN                   │
        │                              │                        │
        │                              │ 5. Deliver queued msg  │
        │                              ├──────────────────────► │
        │                              │    (BOB)               │
```

### Example 3: Duplicate Suppression

```
CLIENT A              SIGNALING SERVER            CLIENT B & CLIENT C

Alice sends msg_123 to Bob
        │                       │
        ├──────────────────────►│
        │                       │ (online)
        │                       ├──────────────────► BOB
        │                       │
        │                       │ (also relay through Carol)
        │                       ├──────────────────► CAROL
        │                       │
CAROL relays to BOB:
        │                       │
        │                       │◄────────────────── CAROL
        │                       │    msg_123
        │                       │    (same id!)
        │                       │
        │ BOB already has msg_123 in cache?
        │ YES → DROP (duplicate suppression)
        │ NO  → PROCESS
```

---

## Integration Checklist

### Client-Side (app.js)

- [ ] Import messageRouter.js module
- [ ] Create MessageRouter instance in connection setup
- [ ] Create RelayForwarder instance
- [ ] Modify setupDataChannel to handle routed_message type
- [ ] Implement handleRoutedMessage function
- [ ] Add sendRoutedMessage function
- [ ] Setup message caching and cleanup
- [ ] Add UI for message creation with routing metadata
- [ ] Add monitoring/stats display functions

### Server-Side (main.py)

- [ ] Import message_routing module
- [ ] Initialize MessageRouter, RelayForwarder, MessageQueue
- [ ] Add periodic cleanup tasks
- [ ] Add "routed_message" handler in WebSocket endpoint
- [ ] Add "relay_message" handler
- [ ] Implement handle_offline_delivery logic
- [ ] Add message queue delivery on login
- [ ] Add /stats endpoint for monitoring
- [ ] Add logging for routing events

---

## Best Practices

### For TTL
```javascript
// ✅ DO: Set appropriate TTL based on message type
const urgentMsg = messageRouter.createMessage(to, content, { ttl: 60 });
const normalMsg = messageRouter.createMessage(to, content, { ttl: 300 });
const fileMsg = messageRouter.createMessage(to, content, { ttl: 3600 });

// ❌ DON'T: Use infinite TTL
{ ttl: 999999999 }  // Bad!
```

### For Message IDs
```javascript
// ✅ DO: Store message IDs for delivery confirmation
if (msg.id in sentMessages) {
  updateDeliveryStatus(msg.id, 'confirmed');
}

// ❌ DON'T: Reuse message IDs
msg.id = "same_id";  // Bad!
```

### For Relay Forwarding
```javascript
// ✅ DO: Check path before relaying
if (msg.path.includes(myUsername)) {
  return;  // Don't relay back to ourselves
}

// ✅ DO: Limit relay hops
if (msg.path.length > 10) {
  return;  // Don't forward - too many hops
}

// ❌ DON'T: Relay without validation
peer.dc.send(JSON.stringify(msg));  // Skip validation!
```

---

## Testing Examples

### Test Duplicate Suppression
```javascript
const msg = messageRouter.createMessage("bob", "test");
messageRouter.processMessage(msg);  // First time: processed
messageRouter.processMessage(msg);  // Second time: rejected
```

### Test TTL Expiration
```javascript
const msg = messageRouter.createMessage("bob", "test", { ttl: 1 });
// Wait 2 seconds
const validation = messageRouter.validateMessage(msg);
// validation.valid should be false
```

### Test Relay Path
```javascript
const msg = messageRouter.createMessage("bob", "test");
msg.path = ["alice"];

relayForwarder.relayMessage(msg, Object.keys(peers));
// Message should now have: msg.path = ["alice", "carol", "server"]
```

---

## Monitoring & Debugging

### Check Message Stats
```javascript
messageRouter.messageCache.cache.size  // How many messages cached
messageRouter.defaultTtl              // Default TTL setting
relayForwarder.relayCache.size        // Messages being relayed
```

### Format Message for Logging
```javascript
console.log(messageRouter.formatMessage(msg));
// Output: {
//   id: "msg_123",
//   from: "alice",
//   to: "bob",
//   path: "alice -> carol -> server",
//   age: 45,
//   ttl: 255,
//   hops: 3
// }
```

### Server Statistics
```javascript
GET /stats
// Returns: {
//   online_users: 5,
//   cached_messages: 142,
//   queued_messages: 23,
//   relay_cache_size: 8
// }
```

---

## Performance Considerations

| Feature | Impact | Optimization |
|---------|--------|--------------|
| Message IDs | Small (strings in map) | Clean cache periodically |
| TTL | Minimal | Check on receive only |
| Duplicates Cache | Medium (stores IDs) | LRU eviction (1000 max) |
| Relay Forwarding | Varies | Limit hops to 10 |
| Message Queue | Medium | Limit per-user (100 max) |

---

## Troubleshooting

### Messages Not Delivered
1. Check TTL not expired: `getRemainingTtl(msg) > 0`
2. Check for duplicates: `isDuplicate(msg.id)`
3. Check path not looping: `Set(path).size === path.length`
4. Check recipient online or queued

### Duplicate Messages
1. Check cache wasn't cleared
2. Verify message ID generation is unique
3. Check message not forwarded by multiple peers

### High Memory Usage
1. Reduce cache size: `new MessageCache(500)`
2. Increase cleanup frequency
3. Lower message TTL
4. Limit relay paths

