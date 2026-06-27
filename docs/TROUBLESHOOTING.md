# 🔧 Troubleshooting Guide

## Issue 1: "Cannot read property 'processMessage' of null"

### Symptom:
```
TypeError: Cannot read property 'processMessage' of null
```

### Cause:
`messageRouter` is null (not initialized)

### Solution:
1. **Check if you clicked Login button**
   - Message router only initializes on login
   - If not logged in, try logging in

2. **Verify app.js has the init code**
   - Search for: `messageRouter = new MessageRouter`
   - Should be in login handler after `log("[ROUTING]...`

3. **Check messageRouter.js is included**
   - In index.html: `<script src="messageRouter.js"></script>`
   - Must come BEFORE app.js

### Verification:
```javascript
// In console:
console.log(myUsername)      // Should exist
console.log(messageRouter)   // Should NOT be null
console.log(typeof messageRouter)  // Should be "object"
```

---

## Issue 2: "ReferenceError: MessageRouter is not defined"

### Symptom:
```
ReferenceError: MessageRouter is not defined at handleRoutedMessage
```

### Cause:
messageRouter.js module not loaded

### Solution:
1. **Check file exists**
   ```
   ✓ d:\torrent\messageRouter.js should exist
   ✓ File should have class MessageRouter
   ```

2. **Check HTML script tag**
   ```html
   <!-- index.html -->
   <script src="messageRouter.js"></script>
   ```

3. **Reload browser**
   - Hard refresh: `Ctrl+Shift+R`
   - Check console for load errors

### Verification:
```javascript
// In console before login:
typeof MessageRouter     // Should be "function"
typeof RelayForwarder    // Should be "function"
typeof MessageCache      // Should be "function"
```

---

## Issue 3: "Cannot import name 'MessageRouter' from 'message_routing'"

### Symptom:
```
ImportError: cannot import name 'MessageRouter' from 'message_routing'
```

### Cause:
message_routing.py file not found or in wrong location

### Solution:
1. **Check file exists**
   ```
   ✓ d:\torrent\server\message_routing.py
   ```

2. **Check Python path**
   ```powershell
   cd d:\torrent\server
   python -c "from message_routing import MessageRouter; print('OK')"
   ```

3. **Check file content**
   - Should have classes: MessageRouter, RelayForwarder, MessageQueue

### Verification:
```python
# In Python console in server folder:
from message_routing import MessageRouter, RelayForwarder, MessageQueue
print(MessageRouter)  # Should print <class 'message_routing.MessageRouter'>
```

---

## Issue 4: "Message router not in scope" / "undefined variable"

### Symptom:
```
NameError: name 'message_router' is not defined
```

### Cause:
Server-side instances not initialized

### Solution:
1. **Check main.py imports**
   ```python
   from message_routing import MessageRouter, RelayForwarder, MessageQueue
   ```

2. **Check initialization in main.py**
   ```python
   message_router = MessageRouter(server_name="signaling_server")
   relay_forwarder = RelayForwarder(message_router)
   message_queue = MessageQueue(max_per_user=100)
   ```
   Should be AFTER `app = FastAPI()` and BEFORE websocket endpoint

3. **Restart server**
   ```powershell
   # Stop: Ctrl+C
   # Restart:
   python -m uvicorn main:app --reload
   ```

### Verification:
```python
# In console:
python -m uvicorn main:app --reload
# Should start without ImportError
```

---

## Issue 5: Messages Not Appearing / Lost Messages

### Symptom:
- Send message but doesn't appear
- No error messages
- Silent failure

### Debugging Steps:

1. **Check Browser Console (F12)**
   ```javascript
   // Look for:
   [ROUTING] Sending message...
   [ROUTING] Sent directly...
   [ROUTING] Message delivered...
   ```
   If not seeing these, routing not being called

2. **Check Server Logs**
   ```
   [Server] Routed msg_123 from alice to bob
   [Server] Message msg_456 queued for offline user bob
   ```
   If not seeing these, message not reaching server

3. **Check Recipients Connected**
   ```javascript
   // In console:
   Object.keys(peers).filter(p => peers[p].connected)
   // Should show connected peers
   ```

4. **Check if Direct P2P Works**
   - Try calling: `sendRoutedMessage("bob", "test")`
   - Check if logs show "Sent directly"

5. **Check Server Queue**
   ```
   GET http://localhost:8000/stats
   Look for: "queued_messages"
   ```

### Solutions by Symptom:

**"No logs appearing"**:
- Message handler not being called
- Check: `if (msg.type === "routed_message")` in setupDataChannel
- Verify message is being sent as routed_message type

**"Logs show sending but not receiving"**:
- P2P connection issue
- Check WebRTC status: `console.log(peers[user].dc.readyState)`
- Should be "open"

**"Shows queued but not delivered"**:
- Recipient not logging in yet (correct behavior)
- When recipient logs in, should auto-deliver
- Check server logs on recipient login

---

## Issue 6: Server Logs Show Nothing

### Symptom:
- Server running but no routing logs
- No messages appear in console

### Cause:
Message not reaching server (routing type not recognized)

### Solution:
1. **Check message type**
   - Client sends: `type: "routed_message"`
   - Server expects: `t == "routed_message"`

2. **Check server handlers exist**
   ```python
   # In main.py, should have:
   elif t == "routed_message":
       await handle_routed_message(...)
   elif t == "relay_message":
       await handle_relay_message(...)
   ```

3. **Check server is listening**
   ```powershell
   # Look for:
   Uvicorn running on http://127.0.0.1:8000
   Application startup complete
   ```

### Verification:
```python
# Add debug logging temporarily:
print(f"[DEBUG] Received message type: {t}")
print(f"[DEBUG] Full message: {msg}")
```

---

## Issue 7: "Max hops exceeded" or "Routing loop detected"

### Symptom:
```
[ROUTING] Message rejected: Routing loop detected
[ROUTING] Message rejected: Max hops exceeded
```

### Cause:
Message being forwarded in circles

### Why It Happens:
1. Message path grows: `["alice", "carol", "bob", "alice"]` (loop!)
2. Message forwarded too many times: > 10 hops

### Solution:
1. **Check relay logic**
   - Don't relay to sender
   - Check: `msg.path.includes(myUsername)` before relaying

2. **Verify path is tracked**
   - Before relay: `msg.path.push(myUsername)`
   - After relay: path should grow each hop

3. **Check connected peers**
   - Reduce relay attempts if many peers
   - Limit to most reliable peers

### Verification:
```javascript
// Check message path:
console.log(msg.path);
console.log(msg.path.length);
// Should be: ["alice", "carol", "bob"] (3 hops max for test)
```

---

## Issue 8: Messages Very Slow / High Latency

### Symptom:
- Messages take 5-10+ seconds
- Relay seems stuck
- Timeouts occurring

### Cause:
1. Waiting for queue cleanup
2. Many messages in cache
3. Network latency
4. Server overloaded

### Solution:
1. **Check cache size**
   ```javascript
   messageRouter.messageCache.cache.size
   // If > 500, cleanup soon
   ```

2. **Check queue size**
   ```javascript
   // Visit: http://localhost:8000/stats
   // Check: queue_stats
   ```

3. **Reduce cleanup interval**
   ```javascript
   // Change from 60s to 30s:
   setInterval(() => startRoutingCleanup(), 30000);
   ```

4. **Reduce TTL to clear cache faster**
   ```javascript
   messageRouter.defaultTtl = 60;  // Instead of 300
   ```

---

## Issue 9: Duplicate Messages Appearing

### Symptom:
- Same message appears multiple times
- Different timestamps but same content/ID

### Cause:
1. Duplicate suppression not working
2. Cache cleared unexpectedly
3. New browser session (separate cache)

### Solution:
1. **Check cache is persistent in session**
   ```javascript
   // Check:
   messageRouter.messageCache.cache.size
   // Should increase with each message
   ```

2. **Verify isDuplicate works**
   ```javascript
   const msg = messageRouter.createMessage("bob", "test");
   const result1 = messageRouter.processMessage(msg);
   const result2 = messageRouter.processMessage(msg);
   
   console.log(result1.processed);  // Should be true
   console.log(result2.processed);  // Should be false
   ```

3. **Check browser tabs**
   - Different browser tabs = different cache
   - Open same tab for test

### Note:
Multiple browser windows/tabs = separate MessageRouter instances = separate caches (expected)

---

## Issue 10: "Queue full for user" Error

### Symptom:
```json
{
  "type": "message_error",
  "error": "Queue full for user bob"
}
```

### Cause:
100+ messages queued for offline user (default limit)

### Solution:
1. **Increase queue limit**
   ```python
   # In main.py:
   message_queue = MessageQueue(max_per_user=500)  # Instead of 100
   ```

2. **User comes online**
   - Messages auto-deliver when user logs in
   - Queue cleared

3. **Delete old messages from queue**
   ```python
   # Manual cleanup:
   message_queue.cleanup(max_age_seconds=600)  # Older than 10 min
   ```

### Verification:
```
GET http://localhost:8000/stats
Check: queue_stats.bob (should be < 100)
```

---

## Issue 11: Cleanup Logs Not Showing

### Symptom:
```
[Cleanup] Expired messages: 0, Relays: 0, Queue items: 0
```
Never appears after 60 seconds

### Cause:
1. Cleanup not started
2. Nothing to clean
3. No messages sent

### Solution:
1. **Check cleanup started**
   ```javascript
   // In browser console:
   showRoutingStats()
   // Send several messages
   // Wait 60+ seconds
   ```

2. **Check startup event running**
   ```python
   # In server logs should show:
   Application startup complete
   ```

3. **Manually trigger cleanup**
   ```python
   # In Python:
   await periodic_cleanup()  # Manually call once
   ```

---

## Issue 12: CORS or WebSocket Connection Errors

### Symptom:
```
Failed to load WebSocket
Connection refused
cors error
```

### Cause:
Server not running or wrong URL

### Solution:
1. **Check server running**
   ```powershell
   # Should see:
   Uvicorn running on http://127.0.0.1:8000
   Application startup complete
   ```

2. **Check client URL**
   ```javascript
   // In app.js:
   ws = new WebSocket("ws://localhost:8000/ws");
   // Should be port 8000 (server)
   // Not 5173 (dev server)
   ```

3. **Check firewall**
   - Port 8000 should be open locally
   - Try: `http://localhost:8000/` in browser

---

## Diagnostic Commands

### Client (Browser Console F12):
```javascript
// Check initialization:
myUsername                           // Should exist
messageRouter                        // Should not be null
relayForwarder                       // Should not be null
peers                               // Should be object

// Check stats:
showRoutingStats()                  // View table

// Check cache:
messageRouter.messageCache.cache.size    // Should be >0 after messages

// Check relay cache:
relayForwarder.relayCache.size          // Should be >0 if relaying

// Manually create message:
const msg = messageRouter.createMessage("bob", "test");
console.log(msg);                   // See message structure

// Manually test validation:
messageRouter.validateMessage(msg)  // Should show valid status
```

### Server (Terminal):
```python
# Check imports work:
python -c "from message_routing import MessageRouter; print('OK')"

# Check main.py syntax:
python -m py_compile server/main.py

# Run server:
python -m uvicorn server.main:app --reload

# Check stats endpoint:
curl http://localhost:8000/stats
```

---

## Common Mistakes to Avoid

❌ **Wrong**: Script tag after app.js
```html
<script src="app.js"></script>
<script src="messageRouter.js"></script>  <!-- WRONG -->
```

✅ **Right**: Script tag before app.js
```html
<script src="messageRouter.js"></script>
<script src="app.js"></script>  <!-- CORRECT -->
```

---

❌ **Wrong**: Forget to call `sendRoutedMessage()`
```javascript
const msg = messageRouter.createMessage("bob", "test");
// Just created, not sent!
```

✅ **Right**: Actually send the message
```javascript
sendRoutedMessage("bob", "test");
// Or manually send via data channel
```

---

❌ **Wrong**: Check messageRouter before login
```javascript
// Before clicking login:
showRoutingStats()  // messageRouter is null!
```

✅ **Right**: Check after login
```javascript
// After clicking login:
showRoutingStats()  // Now it works!
```

---

❌ **Wrong**: Forget to start server
```
Visit: http://localhost:5173
[X] WebSocket fails
```

✅ **Right**: Start both servers
```powershell
# Terminal 1: Python server
python -m uvicorn server.main:app --reload

# Terminal 2: Dev server  
npm run dev

# Then visit: http://localhost:5173
```

---

## Getting Help

If you can't solve it:

1. **Collect Info**:
   ```javascript
   // Client side:
   showRoutingStats()
   console.log(Object.keys(peers).length)
   ```

2. **Check Logs**:
   - Browser console (F12)
   - Server terminal
   - Check for `[ROUTING]` or `[Server]` messages

3. **Verify Files**:
   - messageRouter.js exists
   - message_routing.py exists
   - Both files have content (not empty)

4. **Test Basics**:
   - Can login? (WebSocket connection works)
   - Can see user list? (Server responds)
   - Can connect P2P? (WebRTC works)

5. **Review VERIFICATION_GUIDE.md**:
   - Check all code changes were applied
   - Verify line numbers match

---

## Quick Fix Checklist

- [ ] `messageRouter.js` exists and is included in HTML
- [ ] `message_routing.py` exists in server folder
- [ ] app.js has messageRouter initialization code
- [ ] main.py imports message_routing classes
- [ ] Server running: `python -m uvicorn main:app --reload`
- [ ] Dev server running: `npm run dev`
- [ ] Browser console shows no errors (F12)
- [ ] Logged in successfully
- [ ] Can see other users online
- [ ] Try sending test message

Most issues are fixed by restarting both servers and doing a hard refresh (Ctrl+Shift+R)!

