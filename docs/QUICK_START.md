# Quick Start: Using Message Routing

## 1️⃣ **Initialize** (Auto on Login)

When you click login button:
```javascript
✅ messageRouter initialized
✅ relayForwarder initialized  
✅ Cleanup task started
✅ Ready for messages
```

No manual initialization needed!

---

## 2️⃣ **Send Message**

### Simple Send:
```javascript
sendRoutedMessage("bob", "Hello Bob!");
```

### What Happens:
1. ✅ Creates message with unique ID
2. ✅ Checks if Bob is connected directly
3. ✅ If YES → Send P2P
4. ✅ If NO → Relay through peers or queue on server
5. ✅ Server confirms with receipt

---

## 3️⃣ **Receive Message**

### Auto-handled:
- ✅ Validation (TTL, duplicates, loops)
- ✅ If for you → Display
- ✅ If not for you → Forward to other peers

### Message appears in log:
```
[ROUTING] Message delivered from alice
  Content: Hello Bob!
  Path: alice -> carol -> server
  TTL Remaining: 295s
```

---

## 4️⃣ **Check Status**

### Client Status:
```javascript
showRoutingStats()
```

Output:
```
username: "alice"
cached_messages: 5
relay_cache_size: 2
connected_peers: 3
default_ttl: 300
```

### Server Status:
```
Visit: http://localhost:8000/stats
```

Shows:
```json
{
  "online_users": 2,
  "queued_messages": 3,
  "cached_messages": 42
}
```

---

## 5️⃣ **Common Scenarios**

### Scenario A: Both Users Online & Connected
```
Alice ──(P2P)──► Bob
     ✅ Direct delivery
```

### Scenario B: One User Offline
```
Alice → Server → Bob (when he logs in)
     ✅ Message queued
     ✅ Auto-delivered on login
```

### Scenario C: No Direct P2P (Firewall)
```
Alice ──► Carol (connected) ──► Bob
         ✅ Relay through Carol
```

---

## 6️⃣ **Important: Where Files Are**

```
d:\torrent\
├── client\
│   ├── index.html            ← UI page
│   ├── app.js                ← Updated with routing
│   └── messageRouter.js      ← MUST be included before app.js
├── server\
│   ├── main.py               ← Updated with routing
│   ├── message_routing.py    ← MUST be here
│   └── requirements.txt      ← Backend dependencies
├── docs\
│   ├── QUICK_START.md
│   └── ARCHITECTURE.md
├── package.json
└── README.md
```

---

## 7️⃣ **Add HTML Script Include**

In your `index.html` add before `app.js`:
```html
<!DOCTYPE html>
<html>
<head>
  <!-- ... other stuff ... -->
</head>
<body>
  <!-- ... UI elements ... -->
  
  <!-- IMPORTANT: Add this line -->
  <script src="messageRouter.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

---

## 8️⃣ **Requirements.txt Update**

Your `server/requirements.txt` should have:
```
fastapi
uvicorn
libsodium-wrappers  # If using
```

No new Python packages needed for message_routing.py (uses only stdlib)

---

## 9️⃣ **Start Server & Client**

### Terminal 1 - Start Python Server:
```powershell
cd d:\torrent\server
python -m uvicorn main:app --reload
```

### Terminal 2 - Start Dev Server:
```powershell
cd d:\torrent
npm run dev
```

### Browser:
- Open: `http://localhost:5173`
- Login with username
- Send messages!

---

## 🔟 **Monitor in Console**

### Open browser DevTools: `F12`

### See these messages:
```
[ROUTING] Message router initialized
[ROUTING] Sending message msg_123 to bob
[ROUTING] Sent directly to bob
[ROUTING] Cache cleanup completed
```

### View stats:
```javascript
showRoutingStats()
```

---

## ⚠️ Common Issues & Fixes

### Issue: "Message router not initialized"
**Fix**: Make sure you clicked Login button
```javascript
✅ messageRouter should not be null
```

### Issue: Messages not appearing
**Fix**: Check if routed_message handler working:
```javascript
console.log(messageRouter.messageCache.cache.size);  // Should grow
```

### Issue: Script error about messageRouter
**Fix**: Check messageRouter.js is included in HTML:
```html
<script src="messageRouter.js"></script>  <!-- MUST be before app.js -->
```

### Issue: Server stats shows old data
**Fix**: Cleanup task runs every 60 seconds. Wait or restart.

---

## 📊 Message Structure Reference

Every routed message has:
```javascript
{
  id: "msg_1718127600_abc123",  // Unique ID
  from: "alice",                // Sender
  to: "bob",                    // Recipient
  content: "Hello",             // Your data
  timestamp: 1718127600,        // When sent
  ttl: 300,                     // Expires in 5 min
  path: ["alice"],              // Route taken
  encrypted: false,
  priority: "normal"
}
```

---

## 🎯 What Gets Logged

### Client Console:
```
[ROUTING] Message router initialized
[ROUTING] Sending message msg_... to bob
[ROUTING] Sent directly to bob
[ROUTING] Message delivered from alice
[ROUTING] Cache cleanup completed
```

### Server Terminal:
```
[Server] Routed msg_123 from alice to bob
[Server] Message msg_456 queued for offline user bob
[Server] Delivered 1 queued messages to bob
[Cleanup] Expired messages: 5, Relays: 2, Queue items: 1
```

---

## ✅ Checklist Before You Start

- [ ] `messageRouter.js` file exists in project
- [ ] `message_routing.py` exists in `server/` folder
- [ ] `index.html` includes `<script src="messageRouter.js"></script>`
- [ ] `app.js` has messageRouter code (already updated)
- [ ] `main.py` imports message_routing (already updated)
- [ ] Python dependencies installed (`pip install -r requirements.txt`)
- [ ] Server running on http://localhost:8000
- [ ] Dev server running on http://localhost:5173
- [ ] Browser DevTools open to see logs

---

## 🚀 You're Ready!

Just:
1. Open browser to localhost:5173
2. Login
3. Click user from list
4. Type message
5. Click Send
6. Watch routing magic happen! ✨

---

## Advanced: Custom TTL per Message

```javascript
// Quick TTL
sendRoutedMessage("bob", "Urgent!", { ttl: 60 });  // 1 min

// Long TTL
sendRoutedMessage("bob", "File", { ttl: 3600 });  // 1 hour
```

---

## Advanced: View Detailed Message Info

```javascript
const msg = messageRouter.createMessage("bob", "test");
console.log(messageRouter.formatMessage(msg));
// Shows: id, from, to, path, age, ttl, hops
```

---

That's it! Everything is already integrated and ready to use. 🎉

