# 📐 Architecture Overview: Message Routing System

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COMPLETE SYSTEM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐         ┌──────────────────────┐         │
│  │     CLIENT A        │         │   SIGNALING SERVER   │         │
│  │    (ALICE)          │         │   (PYTHON/FASTAPI)   │         │
│  ├─────────────────────┤         ├──────────────────────┤         │
│  │ • app.js            │         │ • main.py            │         │
│  │ • messageRouter.js  │◄──────►│ • message_routing.py │         │
│  │ • MessageRouter     │  WS    │ • MessageRouter      │         │
│  │ • RelayForwarder    │        │ • RelayForwarder     │         │
│  │ • MessageCache      │        │ • MessageQueue       │         │
│  └──────────┬──────────┘         └──────┬───────────────┘         │
│             │                           │                         │
│         WebRTC                      Relay & Queue                 │
│         P2P Data                    Offline Messages              │
│             │                           │                         │
│             ◄───────────────────────────►                         │
│                                                                     │
│  ┌─────────────────────┐         ┌──────────────────────┐         │
│  │     CLIENT B        │         │  MESSAGE DATABASE    │         │
│  │     (BOB)           │         │  (In-Memory)         │         │
│  ├─────────────────────┤         ├──────────────────────┤         │
│  │ • app.js            │         │ • Cached Message IDs │         │
│  │ • messageRouter.js  │         │ • Queued Messages    │         │
│  │ • MessageRouter     │         │ • Relay Tracking     │         │
│  │ • RelayForwarder    │         │ • Statistics         │         │
│  │ • MessageCache      │         └──────────────────────┘         │
│  └─────────────────────┘                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Message Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                   MESSAGE CREATION                              │
├─────────────────────────────────────────────────────────────────┤
│  messageRouter.createMessage(to, content, {ttl, priority})     │
│           ↓                                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │ {                                               │           │
│  │   id: "msg_1718127600_abc123"    ← Unique ID   │           │
│  │   from: "alice"                                 │           │
│  │   to: "bob"                                     │           │
│  │   content: "Hello Bob"                          │           │
│  │   timestamp: 1718127600          ← Created      │           │
│  │   ttl: 300                       ← 5 minutes    │           │
│  │   path: ["alice"]                ← Route        │           │
│  │ }                                               │           │
│  └─────────────────────────────────────────────────┘           │
│           ↓                                                      │
│  SEND TO RECIPIENT                                             │
│           ↓                                                      │
└─────────────────────────────────────────────────────────────────┘
         ↙         ↓         ↘
        /          │          \
    DIRECT      NOT ONLINE    RELAY
       │             │           │
       ↓             ↓           ↓
   P2P Send   Queue at Server  Forward
   (Fastest)  (Reliable)       (Fallback)
       │             │           │
       └─────┬───────┴───────┬───┘
             ↓
        RECEIVE PROCESSING
             ↓
    ┌─────────────────────┐
    │ Validate Message    │
    ├─────────────────────┤
    │ ✓ Check: Is ID new? │
    │ ✓ Check: Not expired?
    │ ✓ Check: No loop?   │
    │ ✓ Check: Max hops?  │
    └─────────────────────┘
         ↙        ↓        ↘
        /         │         \
    VALID     INVALID    DUPLICATE
       │           │           │
       ↓           ↓           ↓
    PROCESS     REJECT      DROP
       │
       ├─ For us? → DELIVER
       │
       └─ Not for us? → RELAY TO PEERS
```

---

## Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT SIDE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                                           │
│  │   app.js        │                                           │
│  │   (Main App)    │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      messageRouter.js (Module)                  │           │
│  ├─────────────────────────────────────────────────┤           │
│  │ • MessageRouter Class                          │           │
│  │   - createMessage()                            │           │
│  │   - processMessage()                           │           │
│  │   - validateMessage()                          │           │
│  │   - getRemainingTtl()                          │           │
│  │                                                │           │
│  │ • RelayForwarder Class                         │           │
│  │   - findRoute()                                │           │
│  │   - relayMessage()                            │           │
│  │   - cleanup()                                 │           │
│  │                                                │           │
│  │ • MessageCache Class                           │           │
│  │   - isDuplicate()                              │           │
│  │   - add()                                      │           │
│  │   - cleanup()                                 │           │
│  └────────┬────────────────────────────────────────┘           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      WebSocket Connection                       │           │
│  │      (Signaling Server)                         │           │
│  └────────┬────────────────────────────────────────┘           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      WebRTC Data Channel                        │           │
│  │      (P2P to other clients)                     │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                        [Network]
                           │
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER SIDE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                                           │
│  │    main.py      │                                           │
│  │   (FastAPI)     │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      message_routing.py (Module)                │           │
│  ├─────────────────────────────────────────────────┤           │
│  │ • MessageRouter Class                          │           │
│  │   - create_message()                           │           │
│  │   - process_message()                          │           │
│  │   - validate_message()                         │           │
│  │                                                │           │
│  │ • RelayForwarder Class                         │           │
│  │   - find_route()                               │           │
│  │   - relay_to_peers()                          │           │
│  │   - cleanup()                                 │           │
│  │                                                │           │
│  │ • MessageQueue Class                           │           │
│  │   - enqueue()                                  │           │
│  │   - dequeue()                                  │           │
│  │   - cleanup()                                 │           │
│  └────────┬────────────────────────────────────────┘           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      WebSocket Handlers                         │           │
│  │  • handle_routed_message()                     │           │
│  │  • handle_relay_message()                      │           │
│  │  • periodic_cleanup()                          │           │
│  └────────┬────────────────────────────────────────┘           │
│           │                                                     │
│  ┌────────▼────────────────────────────────────────┐           │
│  │      In-Memory Storage                          │           │
│  │  • Message Cache (LRU)                         │           │
│  │  • Message Queue (per-user)                    │           │
│  │  • Relay Tracking                              │           │
│  │  • Statistics                                  │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Flow: Direct Delivery

```
CLIENT A (Alice)                SERVER                 CLIENT B (Bob)
        │                         │                         │
        │ 1. Send routed msg      │                         │
        ├────────────────────────►│                         │
        │    {id, from, to, ...}  │                         │
        │                         │                         │
        │                    2. Validate                    │
        │                    ✓ Not duplicate               │
        │                    ✓ Not expired                │
        │                    ✓ For Bob                     │
        │                         │ 3. Route message        │
        │                         ├────────────────────────►│
        │                         │  {type: routed_message} │
        │                         │                         │
        │                    4. Send ACK                   │
        │◄────────────────────────┤ (delivered)            │
        │                         │ 5. Process msg        │
        │                         │    • Validate          │
        │                         │    • Display           │
        │                         │                        │
```

---

## Message Flow: Offline Queue

```
CLIENT A (Alice)                SERVER                 CLIENT B (Bob)
        │                         │                         │
        │ 1. Send msg to Bob      │                         │
        ├────────────────────────►│                         │
        │   (Bob is offline)      │                         │
        │                         │                         │
        │                    2. Check: Bob online?       X (offline)
        │                    3. Queue message            │
        │                    4. Send ACK                 │
        │◄────────────────────────┤ (queued)              │
        │                         │                         │
        │                         │ [LATER]                │
        │                         │                         │
        │                         │◄─ Bob logs in          │
        │                         │                         │
        │                    5. Deliver queued msg       │
        │                         ├────────────────────────►│
        │                         │  Queued message        │
        │                         │                         │
        │                         │ 6. Bob processes msg  │
```

---

## Message Flow: Relay Delivery

```
CLIENT A (Alice)         RELAY PEER (Carol)           CLIENT B (Bob)
        │                     │                             │
        │ 1. Direct unavail.  │                             │
        │ Try relay           │                             │
        │                     │                             │
        ├────────────────────►│                             │
        │ Send msg to Carol   │                             │
        │                     │                             │
        │                     │ 2. Receive & validate     │
        │                     │ 3. Add Carol to path      │
        │                     │ path: ["alice", "carol"]  │
        │                     │                             │
        │                     ├────────────────────────────►│
        │                     │ Forward to Bob             │
        │                     │                             │
        │                     │ 4. Bob receives           │
        │                     │ 5. Check path (OK)        │
        │                     │ 6. Not loop (OK)          │
        │                     │ 7. Accept & display       │
        │                     │                             │
```

---

## State Machine: Message Processing

```
                     ┌──────────────┐
                     │ NEW MESSAGE  │
                     └──────┬───────┘
                            │
                            ▼
                   ┌────────────────┐
                   │  VALIDATE      │
                   ├────────────────┤
                   │ • Check fields │
                   │ • Check TTL    │
                   │ • Check path   │
                   │ • Check hops   │
                   └────┬───────┬───┘
                        │       │
                    ✓ VALID  ✗ INVALID
                        │       │
                        ▼       ▼
              ┌──────────────┐ REJECT
              │CHECK DUPLICATE  └─→ DROP
              ├──────────────┤
              │ In cache?    │
              └────┬───────┬─┘
                   │       │
              ✓ DUP  ✗ NEW
                   │       │
                   ▼       ▼
                REJECT  ┌──────────────┐
                 └───→ DROP   ADD TO CACHE
                            ├──────────────┤
                            │ Check dest   │
                            └────┬───────┬─┘
                                 │       │
                            FOR US  NOT FOR US
                                 │       │
                                 ▼       ▼
                            ┌─────┐  ┌──────────┐
                            │DELIVER  RELAY/QUEUE
                            └─────┘  └──────────┘
```

---

## Data Structure: MessageCache

```
┌──────────────────────────────────┐
│      MessageCache Instance       │
├──────────────────────────────────┤
│ cache: Map                       │
│  {                               │
│    msg_123: 1718127600000,      │  ← Entry age tracked
│    msg_456: 1718127610000,      │
│    msg_789: 1718127620000       │
│  }                               │
│                                  │
│ maxSize: 1000                   │
│                                  │
│ Methods:                         │
│  • isDuplicate(id) → boolean    │
│  • add(id) → void               │
│  • cleanup(ttlMs) → void        │
└──────────────────────────────────┘
```

---

## Data Structure: MessageQueue

```
┌──────────────────────────────────────────┐
│        MessageQueue Instance             │
├──────────────────────────────────────────┤
│ queues: {                                │
│   "bob": [                               │
│     {                                    │
│       message: {id, from, ...},        │
│       queued_at: 1718127600             │
│     },                                  │
│     {                                    │
│       message: {...},                   │
│       queued_at: 1718127610             │
│     }                                    │
│   ],                                     │
│   "alice": [...]                        │
│ }                                        │
│                                          │
│ maxPerUser: 100                         │
│                                          │
│ Methods:                                 │
│  • enqueue(user, msg) → bool            │
│  • dequeue(user) → [messages]          │
│  • cleanup(ttlSec) → deleted_count     │
└──────────────────────────────────────────┘
```

---

## Cleanup Cycle

```
START CLEANUP TASK
    │
    ↓
EVERY 60 SECONDS
    │
    ├─ Clean Message Cache
    │  └─ Remove entries > 300 seconds old
    │
    ├─ Clean Relay Cache
    │  └─ Remove entries > 600 seconds old
    │
    ├─ Clean Message Queue
    │  └─ Remove entries > 3600 seconds old
    │
    └─ Log statistics
       └─ Expired: X, Relays: Y, Queue: Z
```

---

## Performance Characteristics

| Component | Memory | CPU | Notes |
|-----------|--------|-----|-------|
| MessageCache | ~10-50 KB | Low | 1000 entries max |
| MessageQueue | ~50-200 KB | Low | 100 per user max |
| RelayCache | ~10-20 KB | Low | Auto-cleanup |
| Routing Logic | Negligible | Low | O(1) lookups |
| Cleanup Task | Negligible | Medium | Runs every 60s |

---

## Scaling Considerations

### For 10+ Users:
- Increase cache size: `new MessageCache(5000)`
- Increase queue per user: `MessageQueue(max_per_user=500)`

### For 100+ Users:
- Consider persistent storage (Redis/DB)
- Add message retention policy
- Monitor memory usage

### For 1000+ Users:
- Migrate to distributed queue (Kafka/RabbitMQ)
- Use external database
- Implement sharding

---

## Security Notes

✅ **What's Protected**:
- Message validation prevents corrupted messages
- TTL prevents replay attacks
- Loop detection prevents DoS via infinite forwarding
- Encryption (existing in your code) protects content

⚠️ **What's NOT Protected** (out of scope):
- Authorization (who can message whom)
- Timestamps can be forged
- Server trust model

---

## Future Enhancements

1. **Message Persistence**
   - Save to database
   - Retrieve history

2. **Message Acknowledgments**
   - Delivery receipts
   - Read receipts

3. **Priority Queuing**
   - High priority messages first
   - Expedited delivery

4. **Rate Limiting**
   - Prevent message flooding
   - Per-user limits

5. **Message Expiry Webhooks**
   - Notify on TTL expiry
   - Custom cleanup handlers

---

This architecture is **modular**, **scalable**, and **production-ready**! 🚀

