# Torrent P2P Messaging

Torrent P2P Messaging is a browser-based peer-to-peer messaging prototype focused on secure communication, WebRTC transport, and modular client-side architecture. The project combines a TypeScript client application with a Node.js WebSocket bootstrap server to support peer discovery, signaling, encrypted chat, file transfer, heartbeat monitoring, and reconnection.

## What the project does

- Lets users join a shared bootstrap network with a username.
- Discovers online peers through the signaling server.
- Establishes direct WebRTC data-channel connections.
- Sends encrypted messages using client-side crypto primitives.
- Supports file transfer, heartbeat checks, and reconnect workflows.
- Keeps the server lightweight by coordinating signaling rather than relaying every message.

## Current project structure

```text
torrent_p2p_messaging/
|-- client/
|   |-- app.ts
|   |-- index.html
|   |-- package.json
|   |-- bootstrap/
|   |-- encryption/
|   |-- FileTransfer/
|   |-- heartbeat/
|   |-- identity/
|   |-- integration/
|   |-- messaging/
|   |-- peerDiscovery/
|   |-- reconnection/
|   `-- webrtc/
|-- server/
|   |-- main.ts
|   |-- package.json
|   |-- requirements.txt
|   |-- bootstrap/
|   |   |-- bootstrapServer.ts
|   |   |-- config/
|   |   |-- handlers/
|   |   |-- managers/
|   |   |-- models/
|   |   |-- network/
|   |   |-- protocol/
|   |   |-- rateLimit/
|   |   `-- types/
|   `-- test-join.js
|-- assets/
|-- docs/
`-- README.md
```

## Core architecture

The application is split into two main layers:

- Client layer: orchestration, identity, encryption, messaging, WebRTC, file transfer, heartbeat, and reconnection modules.
- Server layer: bootstrap WebSocket server, packet handling, peer management, rate limiting, and signaling logic.

The runtime flow is:

1. The client connects to the bootstrap server.
2. The server tracks peer presence and relays signaling packets.
3. The client creates or joins WebRTC sessions.
4. The messaging layer encrypts data and exchanges it over the data channel.
5. File transfer, heartbeat, and reconnection layers operate independently on top of the same transport.

## Tech stack

- Frontend: TypeScript, HTML, Vite
- P2P transport: WebRTC DataChannel
- Signaling: WebSocket via Node.js
- Backend: TypeScript runtime with Node.js
- Cryptography: libsodium-wrappers
- Package management: npm

## Setup

### Client

```powershell
cd d:\torrent_p2p_messaging\client
npm install
npm run dev
```

### Server

```powershell
cd d:\torrent_p2p_messaging\server
npm install
npm run dev
```

Then open the client in a browser at the Vite address shown in the terminal, typically http://localhost:5173.

## Development notes

- Use the existing module boundaries instead of introducing a new framework layer.
- Keep transport, encryption, and UI orchestration separated.
- Prefer small focused services over large monolithic handlers.
- Handle invalid packets, failed connections, and crypto edge cases gracefully.

## Different-network testing

Same-Wi-Fi testing can succeed with local addresses. Different-network testing needs two public pieces:

1. A reachable bootstrap WebSocket server, for example `wss://your-bootstrap.example.com`.
2. ICE servers for WebRTC NAT traversal. Keep public STUN for discovery, but use your own TURN server such as coturn or a managed TURN provider for reliable relay fallback.

Client configuration can be provided with Vite environment variables. When running from `client/`, put these in `client/.env.local` or export them in the shell before `npm run dev`:

```powershell
VITE_BOOTSTRAP_URL=wss://your-bootstrap.example.com
VITE_ICE_SERVERS_JSON='[{"urls":["stun:stun.l.google.com:19302"]},{"urls":["turn:turn.example.com:3478","turns:turn.example.com:5349"],"username":"user","credential":"pass"}]'
VITE_ICE_TRANSPORT_POLICY=all
```

For a strict TURN test, temporarily set `VITE_ICE_TRANSPORT_POLICY=relay`. If two devices on different networks can chat with `relay`, the TURN path is healthy. Change it back to `all` for normal peer-to-peer operation.

## Project documents

- [Project.md](docs/Project.md)
- [Architecture.md](docs/Architecture.md)
- [PRD.md](docs/PRD.md)
- [rules.md](docs/rules.md)
- [phase.md](docs/phase.md)
- [design.md](docs/design.md)
- [memory.md](docs/memory.md)
