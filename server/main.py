import json
import asyncio
import time
from typing import Dict, Any
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

# ==================== MESSAGE ROUTING IMPORTS ====================
from message_routing import MessageRouter, RelayForwarder, MessageQueue

app = FastAPI()

# Serve frontend files from the client directory
static_dir = Path(__file__).parent.parent / "client"

# ==================== MESSAGE ROUTING INITIALIZATION ====================
message_router = MessageRouter(server_name="signaling_server")
relay_forwarder = RelayForwarder(message_router)
message_queue = MessageQueue(max_per_user=100)


# ==================== PERIODIC CLEANUP TASK ====================
async def periodic_cleanup():
    """Cleanup old message and relay entries"""
    while True:
        await asyncio.sleep(60)  # Every 60 seconds
        
        try:
            # Clean message cache (older than 5 min)
            expired = message_router.message_cache.cleanup(ttl_seconds=300)
            
            # Clean relay cache (older than 10 min)
            relay_expired = relay_forwarder.cleanup(max_age_seconds=600)
            
            # Clean message queue (older than 1 hour)
            queue_cleaned = message_queue.cleanup(max_age_seconds=3600)
            
            if expired > 0 or relay_expired > 0 or queue_cleaned > 0:
                print(f"[Cleanup] Expired messages: {expired}, Relays: {relay_expired}, Queue items: {queue_cleaned}")
        except Exception as e:
            print(f"[Cleanup Error] {e}")


# Start cleanup task on startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(periodic_cleanup())

@app.get("/")
async def root():
    return FileResponse(static_dir / "index.html")

@app.get("/app.js")
async def serve_app():
    return FileResponse(static_dir / "app.js", media_type="application/javascript")

@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    file = static_dir / file_path
    if file.exists() and file.is_file():
        return FileResponse(file)
    return {"error": "File not found"}

clients: Dict[str, WebSocket] = {}


# Send JSON message
async def ws_send(ws: WebSocket, msg: Dict[str, Any]):
    await ws.send_text(json.dumps(msg))


# Broadcast online users
async def broadcast_user_list():
    users = list(clients.keys())

    msg = {
        "type": "user_list",
        "users": users
    }

    # Send to all connected clients
    for ws in clients.values():
        await ws.send_text(json.dumps(msg))


# ==================== MESSAGE ROUTING HANDLERS ====================

async def handle_routed_message(payload: Dict[str, Any], from_username: str, ws: WebSocket):
    """Process incoming routed message"""
    
    # Add server to path
    message_router.add_to_path(payload, "signaling_server")
    
    # Validate message
    result = message_router.process_message(payload)
    
    if not result["processed"]:
        print(f"[Server] Message rejected: {result['reason']}")
        await ws_send(ws, {
            "type": "message_error",
            "message_id": payload.get("id"),
            "error": result["reason"]
        })
        return
    
    target = payload["to"]
    
    # Is target online?
    if target in clients:
        # Forward directly
        await ws_send(clients[target], {
            "type": "routed_message",
            "payload": payload
        })
        
        print(f"[Server] Routed {payload['id']} from {from_username} to {target}")
        print(f"[Server] Path: {' -> '.join(payload.get('path', []))}")
        
        # Send confirmation
        await ws_send(ws, {
            "type": "message_delivered",
            "message_id": payload["id"],
            "delivered_to": target,
            "route": "direct"
        })
    else:
        # Target offline - queue for later
        queued = message_queue.enqueue(target, payload)
        
        if queued:
            await ws_send(ws, {
                "type": "message_queued",
                "message_id": payload["id"],
                "queued_for": target,
                "route": "queue"
            })
            print(f"[Server] Message {payload['id']} queued for offline user {target}")
        else:
            await ws_send(ws, {
                "type": "message_error",
                "message_id": payload["id"],
                "error": f"Queue full for user {target}"
            })


async def handle_relay_message(payload: Dict[str, Any], from_username: str, ws: WebSocket):
    """Handle relay request from a peer"""
    
    # Add this peer to path
    message_router.add_to_path(payload, f"peer_{from_username}")
    
    # Validate
    valid, reason = message_router.validate_message(payload)
    
    if not valid:
        print(f"[Server] Relay validation failed: {reason}")
        return
    
    target = payload["to"]
    
    # Try to deliver
    if target in clients:
        await ws_send(clients[target], {
            "type": "routed_message",
            "payload": payload
        })
        print(f"[Server] Delivered relayed message {payload['id']} to {target}")
    else:
        # Queue for offline user
        message_queue.enqueue(target, payload)
        print(f"[Server] Queued relayed message {payload['id']} for offline user {target}")


@app.get("/stats")
async def get_stats():
    """Return message routing statistics"""
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

                # ==================== DELIVER QUEUED MESSAGES ====================
                queued_messages = message_queue.dequeue(username)
                for queued_msg in queued_messages:
                    await ws_send(ws, {
                        "type": "routed_message",
                        "payload": queued_msg
                    })
                
                if queued_messages:
                    print(f"[Server] Delivered {len(queued_messages)} queued messages to {username}")

                await ws_send(
                    ws,
                    {
                        "type": "login_ok",
                        "username": username,
                        "queued_messages": len(queued_messages)
                    }
                )

                # IMPORTANT: update everyone
                await broadcast_user_list()

            # ==================== ROUTED MESSAGE HANDLING ====================
            elif t == "routed_message":
                await handle_routed_message(msg.get("payload"), username, ws)

            # ==================== RELAY MESSAGE HANDLING ====================
            elif t == "relay_message":
                await handle_relay_message(msg.get("payload"), username, ws)

            # SIGNAL RELAY
            elif t in ("offer", "answer", "ice"):

                to = msg["to"]

                if to not in clients:
                    await ws_send(
                        ws,
                        {
                            "type": "error",
                            "message": f"{to} is offline"
                        }
                    )
                    continue

                msg["from"] = username

                await ws_send(
                    clients[to],
                    msg
                )


            else:
                await ws_send(
                    ws,
                    {
                        "type": "error",
                        "message": "unknown message type"
                    }
                )

    except WebSocketDisconnect:

        if username and clients.get(username) == ws:

            del clients[username]

            # IMPORTANT: update everyone
            await broadcast_user_list()
