# Quick Reference: Message Routing Implementation

## Files Created

1. **messageRouter.js** - Client-side routing module
   - `MessageRouter` class - Core message handling
   - `RelayForwarder` class - Relay logic
   - `MessageCache` class - Duplicate suppression

2. **message_routing.py** - Server-side routing module
   - `MessageRouter` class - Core message handling
   - `RelayForwarder` class - Relay logic
   - `MessageQueue` class - Queue offline messages

3. **MESSAGE_ROUTING_GUIDE.md** - Comprehensive guide

4. **INTEGRATION_CLIENT.md** - Client integration examples

5. **INTEGRATION_SERVER.md** - Server integration examples

---

## Quick Start

### Step 1: Include in HTML
```html
<script src="messageRouter.js"></script>
```

### Step 2: Initialize in JavaScript
```javascript
const messageRouter = new MessageRouter(myUsername);
const relayForwarder = new RelayForwarder(messageRouter, peers, ws);
```

### Step 3: Create & Send Message
```javascript
const msg = messageRouter.createMessage("bob", "Hello Bob");
peers["bob"].dc.send(JSON.stringify({
  type: 'routed_message',
  payload: msg
}));
```

### Step 4: Receive & Process
```javascript
function handleRoutedMessage(incomingMsg) {
  const result = messageRouter.processMessage(incomingMsg);
  
  if (!result.processed) {
    console.log("Message rejected:", result.reason);
    return;
  }
  
  if (result.forUs) {
    console.log("Message for us:", incomingMsg.content);
  } else {
    relayForwarder.relayMessage(incomingMsg, Object.keys(peers));
  }
}
```

---

## The 4 Features Explained

### 1️⃣ Message IDs
**What**: Unique identifier for each message  
**Why**: Track, dedup, confirm delivery  
**How**: `msg.id = "msg_" + timestamp + random`  
**Generated**: Automatically when creating message  

### 2️⃣ Duplicate Suppression
**What**: Drop messages you've already seen  
**Why**: Prevent infinite loops, save resources  
**How**: Store message ID in cache, check before processing  
**Storage**: `MessageCache` - keeps last 1000 messages  

### 3️⃣ TTL (Time To Live)
**What**: Auto-expire old messages  
**Why**: Prevent stale data, limit queue bloat  
**How**: Check age vs TTL on receive  
**Default**: 300 seconds (5 minutes)  
**Configurable**: Per message or globally  

### 4️⃣ Peer Relay Forwarding
**What**: Route messages through other peers  
**Why**: Deliver to offline users via relay  
**How**: Forward through connected peers → server queue  
**Path**: Tracked in `msg.path` array  
**Loop Prevention**: Limit to 10 hops  

---

## Key Classes & Methods

### MessageRouter

```javascript
new MessageRouter(username)
  .createMessage(to, content, {ttl, encrypted})  // Create message
  .processMessage(msg)                             // Validate & process
  .validateMessage(msg)                            // Validate only
  .addToPath(msg)                                  // Add ourselves to path
  .getRemainingTtl(msg)                            // Get remaining TTL
  .getMessageAge(msg)                              // Get age in seconds
  .formatMessage(msg)                              // Format for logging
```

### RelayForwarder

```javascript
new RelayForwarder(messageRouter, peers, ws)
  .findRoute(destination, onlinePeers)             // Best route
  .relayMessage(msg, peers)                        // Forward to peers
  .requestServerRelay(msg)                         // Forward to server
  .cleanup(maxAge)                                 // Clean old entries
```

### MessageCache

```javascript
new MessageCache(maxSize)
  .isDuplicate(messageId)                          // Check if seen
  .add(messageId)                                  // Mark as seen
  .cleanup(ttlMs)                                  // Remove expired
```

---

## Message Structure

```javascript
{
  id: "msg_1718127600_a1b2c3",    // ← Unique ID
  from: "alice",                   // Sender
  to: "bob",                       // Recipient
  content: "Hello",                // Payload
  timestamp: 1718127600,           // When sent
  ttl: 300,                        // ← TTL in seconds
  path: ["alice"],                 // ← Route taken
  encrypted: false,                // Encryption flag
  priority: "normal"               // Priority level
}
```

---

## Common Patterns

### Send Direct Message
```javascript
const msg = messageRouter.createMessage(peer, content);
if (peers[peer]?.dc?.readyState === 'open') {
  peers[peer].dc.send(JSON.stringify({type: 'routed_message', payload: msg}));
}
```

### Handle Incoming Message
```javascript
const result = messageRouter.processMessage(msg);
if (result.processed && result.forUs) {
  displayMessage(msg.from, msg.content);
} else if (result.processed) {
  relayForwarder.relayMessage(msg, connectedPeers);
}
```

### Get Message Stats
```javascript
console.table({
  cached: messageRouter.messageCache.cache.size,
  ttl: messageRouter.defaultTtl,
  relays: relayForwarder.relayCache.size,
  age: messageRouter.getMessageAge(msg),
  ttl_remaining: messageRouter.getRemainingTtl(msg)
});
```

### Check Remaining TTL
```javascript
const remaining = messageRouter.getRemainingTtl(msg);
if (remaining <= 0) {
  console.log("Message expired");
} else {
  console.log(`Valid for ${remaining} more seconds`);
}
```

---

## Server-Side Integration

### Handle Routed Message
```python
from message_routing import MessageRouter, RelayForwarder

router = MessageRouter("server")
relay = RelayForwarder(router)

async def handle_routed_message(msg, username, ws):
    result = router.process_message(msg)
    if not result["processed"]:
        return  # Invalid/duplicate
    
    target = msg["to"]
    if target in clients:
        await send(clients[target], msg)  # Direct
    else:
        queue.enqueue(target, msg)        # Queue for offline
```

### Queue & Deliver on Login
```python
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    username = await ws.receive_text()  # Get username
    
    # Send any queued messages
    for queued_msg in queue.dequeue(username):
        await send(ws, queued_msg)
    
    # ... rest of handler
```

---

## Debugging Commands

### Check Message Cache
```javascript
messageRouter.messageCache.cache           // View all cached IDs
messageRouter.messageCache.cache.size      // Count
messageRouter.messageCache.cleanup()       // Clean expired
```

### Check Relay Cache
```javascript
relayForwarder.relayCache                  // View all relayed
relayForwarder.relayCache.size             // Count
relayForwarder.cleanup()                   // Clean old
```

### Check Message
```javascript
messageRouter.formatMessage(msg)           // Pretty format
messageRouter.validateMessage(msg)         // Validation result
messageRouter.getRemainingTtl(msg)         // TTL remaining
```

### Peer List
```javascript
Object.keys(peers)                         // All peers
Object.keys(peers).filter(p => peers[p].connected)  // Connected
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Duplicate messages | Cache not used | Add msg to cache after processing |
| Old messages processing | TTL not checked | Check `remainingTtl > 0` |
| Infinite loops | No path tracking | Check `path` length < 10 |
| Messages lost | Not forwarding | Relay through peers or queue |
| High memory | Cache growing | Call `cleanup()` periodically |
| Slow delivery | No relay | Check `findRoute()` logic |

---

## Performance Tips

✅ **DO:**
- Clean cache every 60 seconds
- Limit cache to 1000 messages
- Limit hops to 10
- Limit queue per user to 100
- Set realistic TTL (300s default)

❌ **DON'T:**
- Store unlimited messages in cache
- Create circular relay paths
- Use infinite TTL
- Queue messages forever
- Create new cache per message

---

## Testing Checklist

- [ ] Message ID generated uniquely each time
- [ ] Duplicate message rejected
- [ ] Expired message rejected
- [ ] Valid message accepted
- [ ] Message path tracked correctly
- [ ] Loop prevented (path < 10)
- [ ] Direct delivery works
- [ ] Relay delivery works
- [ ] Offline queuing works
- [ ] Queue delivered on login
- [ ] Cache cleaned periodically

---

## File Organization

```
d:\torrent\
├── app.js                         (Client app)
├── index.html                     (UI)
├── package.json
├── messageRouter.js               (✨ NEW)
├── MESSAGE_ROUTING_GUIDE.md       (✨ NEW - Full guide)
├── INTEGRATION_CLIENT.md          (✨ NEW - Client examples)
├── INTEGRATION_SERVER.md          (✨ NEW - Server examples)
└── server\
    ├── main.py                    (Server)
    ├── requirements.txt
    └── message_routing.py         (✨ NEW)
```

---

## Next Steps

1. ✅ Copy `messageRouter.js` to your project
2. ✅ Copy `message_routing.py` to your server folder
3. ✅ Import in HTML: `<script src="messageRouter.js"></script>`
4. ✅ Import in Python: `from message_routing import *`
5. ✅ Initialize routers in connection setup
6. ✅ Update message handlers for new message types
7. ✅ Add periodic cleanup tasks
8. ✅ Test each feature independently
9. ✅ Test integration end-to-end
10. ✅ Monitor with stats endpoints

---

## Resources

- **MESSAGE_ROUTING_GUIDE.md** - Detailed explanation
- **INTEGRATION_CLIENT.md** - Code examples for app.js
- **INTEGRATION_SERVER.md** - Code examples for main.py
- **messageRouter.js** - Complete client implementation
- **message_routing.py** - Complete server implementation

