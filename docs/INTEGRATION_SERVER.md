"""
INTEGRATION GUIDE: Server-side Message Routing
Shows how to integrate message routing into main.py
"""

# ===== ADD TO IMPORTS IN main.py =====
# from message_routing import MessageRouter, RelayForwarder, MessageQueue
# import asyncio

# ===== INITIALIZE GLOBAL INSTANCES =====

"""
At module level in main.py:

message_router = MessageRouter(server_name="signaling_server")
relay_forwarder = RelayForwarder(message_router)
message_queue = MessageQueue(max_per_user=100)

# Periodic cleanup task
async def periodic_cleanup():
    while True:
        await asyncio.sleep(60)  # Every 60 seconds
        
        # Clean message cache
        expired = message_router.message_cache.cleanup(ttl_seconds=300)
        
        # Clean relay cache
        relay_expired = relay_forwarder.cleanup(max_age_seconds=600)
        
        # Clean message queue
        queue_cleaned = message_queue.cleanup(max_age_seconds=3600)
        
        if expired > 0 or relay_expired > 0 or queue_cleaned > 0:
            print(f"[Cleanup] Expired: {expired}, Relay: {relay_expired}, Queue: {queue_cleaned}")
"""


# ===== HANDLE ROUTED MESSAGES FROM CLIENTS =====

"""
In your WebSocket endpoint handler:

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    username = None

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            t = msg.get("type")

            # LOGIN
            if t == "login":
                username = msg["username"]
                clients[username] = ws
                await ws_send(ws, {
                    "type": "login_ok",
                    "username": username
                })
                await broadcast_user_list()

            # RELAY MESSAGE (new)
            elif t == "relay_message":
                await handle_relay_message(msg["payload"], username, ws)

            # ROUTED MESSAGE (new)
            elif t == "routed_message":
                await handle_routed_message(msg["payload"], username, ws)

            # ... other existing handlers ...

            # LOGOUT
            elif t == "logout":
                if username:
                    del clients[username]
                break

    except WebSocketDisconnect:
        if username and username in clients:
            del clients[username]
        await broadcast_user_list()
"""


# ===== MESSAGE HANDLING FUNCTIONS =====

"""
async def handle_routed_message(msg: dict, from_username: str, ws: WebSocket):
    '''Process incoming routed message'''
    
    # Add server to path
    message_router.add_to_path(msg, "signaling_server")
    
    # Validate
    result = message_router.process_message(msg)
    
    if not result["processed"]:
        print(f"[Server] Message rejected: {result['reason']}")
        await ws_send(ws, {
            "type": "message_error",
            "message_id": msg.get("id"),
            "error": result["reason"]
        })
        return
    
    # Get target user
    target = msg["to"]
    
    # Is target online?
    if target in clients:
        # Forward directly
        await ws_send(clients[target], {
            "type": "routed_message",
            "payload": msg
        })
        
        print(f"[Server] Routed {msg['id']} from {from_username} to {target}")
        print(f"[Server] Path: {' -> '.join(msg.get('path', []))}")
        
        # Send confirmation
        await ws_send(ws, {
            "type": "message_delivered",
            "message_id": msg["id"],
            "delivered_to": target,
            "route": "direct"
        })
    else:
        # Target offline - queue or relay
        await handle_offline_delivery(msg, from_username, target, ws)


async def handle_offline_delivery(msg: dict, from_username: str, target: str, ws: WebSocket):
    '''Handle delivery to offline user'''
    
    # Try relay through other online peers
    online_peers = list(clients.keys())
    route = relay_forwarder.find_route(target, online_peers, {})
    
    if route["route"] == "relay":
        # Found relay peers
        forwarded = await relay_through_peers(msg, route["targets"])
        
        await ws_send(ws, {
            "type": "message_relayed",
            "message_id": msg["id"],
            "relayed_through": forwarded,
            "route": "peer_relay"
        })
        print(f"[Server] Message {msg['id']} relayed through {len(forwarded)} peers")
    else:
        # Queue for later
        queued = message_queue.enqueue(target, msg)
        
        if queued:
            await ws_send(ws, {
                "type": "message_queued",
                "message_id": msg["id"],
                "queued_for": target,
                "route": "queue"
            })
            print(f"[Server] Message {msg['id']} queued for {target}")
        else:
            await ws_send(ws, {
                "type": "message_error",
                "message_id": msg["id"],
                "error": "Queue full for user"
            })


async def relay_through_peers(msg: dict, relay_peers: list):
    '''Forward message through relay peers'''
    forwarded = []
    
    for peer_name in relay_peers:
        if peer_name in clients:
            try:
                await ws_send(clients[peer_name], {
                    "type": "relay_request",
                    "payload": msg,
                    "original_target": msg["to"]
                })
                forwarded.append(peer_name)
            except Exception as e:
                print(f"[Server] Failed to relay to {peer_name}: {e}")
    
    return forwarded


async def handle_relay_message(msg: dict, from_username: str, ws: WebSocket):
    '''Handle relay request from client'''
    
    # Add this peer to path
    message_router.add_to_path(msg, f"peer_{from_username}")
    
    # Validate relay
    valid, reason = message_router.validate_message(msg)
    
    if not valid:
        print(f"[Server] Relay validation failed: {reason}")
        return
    
    # Try to deliver or relay further
    target = msg["to"]
    
    if target in clients:
        # Deliver to target
        await ws_send(clients[target], {
            "type": "routed_message",
            "payload": msg
        })
        print(f"[Server] Delivered relayed message to {target}")
    else:
        # Queue for offline user
        message_queue.enqueue(target, msg)
        print(f"[Server] Queued relayed message for {target}")
"""


# ===== DELIVER QUEUED MESSAGES ON LOGIN =====

"""
In your login handler:

if t == "login":
    username = msg["username"]
    clients[username] = ws
    
    # Deliver any queued messages
    queued_msgs = message_queue.dequeue(username)
    for queued_msg in queued_msgs:
        await ws_send(ws, {
            "type": "routed_message",
            "payload": queued_msg
        })
        print(f"[Server] Delivered {len(queued_msgs)} queued messages to {username}")
    
    await ws_send(ws, {
        "type": "login_ok",
        "username": username,
        "queued_messages": len(queued_msgs)
    })
    
    await broadcast_user_list()
"""


# ===== BROADCAST USER STATUS =====

"""
async def broadcast_user_list():
    '''Send online users list to all clients'''
    users = list(clients.keys())
    
    msg = {
        "type": "user_list",
        "users": users,
        "timestamp": int(time.time())
    }
    
    # Send to all connected clients
    for ws in clients.values():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception as e:
            print(f"[Server] Error broadcasting: {e}")
"""


# ===== MESSAGE STATISTICS ENDPOINT =====

"""
@app.get("/stats")
async def get_stats():
    '''Return message routing statistics'''
    
    return {
        "timestamp": time.time(),
        "online_users": len(clients),
        "cached_messages": message_router.message_cache.cache.__sizeof__(),
        "queued_messages": sum(len(q) for q in message_queue.queues.values()),
        "relay_cache_size": len(relay_forwarder.relay_cache),
        "queue_stats": {
            user: len(messages)
            for user, messages in message_queue.queues.items()
        }
    }
"""


# ===== LOGGING HELPER =====

"""
def log_message_routing(event: str, msg: dict, **kwargs):
    '''Log message routing events'''
    timestamp = datetime.now().isoformat()
    
    log_entry = {
        "timestamp": timestamp,
        "event": event,
        "message_id": msg.get("id"),
        "from": msg.get("from"),
        "to": msg.get("to"),
        "path": msg.get("path", []),
        "ttl": msg.get("ttl"),
        "age": message_router.get_message_age(msg),
        **kwargs
    }
    
    print(f"[{event}] {json.dumps(log_entry, indent=2)}")
    
    # Optional: write to file
    # with open('routing.log', 'a') as f:
    #     f.write(json.dumps(log_entry) + '\\n')
"""


# ===== EXAMPLE: COMPLETE WEBSOCKET HANDLER WITH ROUTING =====

"""
import json
import asyncio
from typing import Dict, Any
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from message_routing import MessageRouter, RelayForwarder, MessageQueue

app = FastAPI()
clients: Dict[str, WebSocket] = {}
message_router = MessageRouter(server_name="signaling_server")
relay_forwarder = RelayForwarder(message_router)
message_queue = MessageQueue(max_per_user=100)


async def ws_send(ws: WebSocket, msg: Dict[str, Any]):
    '''Send JSON message'''
    await ws.send_text(json.dumps(msg))


async def broadcast_user_list():
    '''Notify all clients of online users'''
    users = list(clients.keys())
    msg = {"type": "user_list", "users": users}
    
    for ws in clients.values():
        try:
            await ws.send_text(json.dumps(msg))
        except:
            pass


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    username = None

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            t = msg.get("type")

            if t == "login":
                username = msg["username"]
                clients[username] = ws
                
                # Deliver queued messages
                queued = message_queue.dequeue(username)
                for q_msg in queued:
                    await ws_send(ws, {"type": "routed_message", "payload": q_msg})
                
                await ws_send(ws, {"type": "login_ok", "username": username})
                await broadcast_user_list()

            elif t == "routed_message":
                await handle_routed_message(msg["payload"], username, ws)

            elif t == "relay_message":
                await handle_relay_message(msg["payload"], username, ws)

            elif t in ("offer", "answer", "ice"):
                # Existing signal relay logic
                target = msg.get("to")
                if target in clients:
                    msg["from"] = username
                    await ws_send(clients[target], msg)

    except WebSocketDisconnect:
        if username and username in clients:
            del clients[username]
        await broadcast_user_list()
"""
