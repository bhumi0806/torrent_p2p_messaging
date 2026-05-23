import json
from typing import Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

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

                await ws_send(
                    ws,
                    {
                        "type": "login_ok",
                        "username": username
                    }
                )

                # IMPORTANT: update everyone
                await broadcast_user_list()


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
