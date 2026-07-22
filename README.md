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
├── client/
│   ├── app.ts
│   ├── index.html
│   ├── package.json
│   ├── bootstrap/
│   ├── encryption/
│   ├── FileTransfer/
│   ├── heartbeat/
│   ├── identity/
│   ├── integration/
│   ├── messaging/
│   ├── peerDiscovery/
│   ├── reconnection/
│   └── webrtc/
├── server/
│   ├── main.ts
│   ├── package.json
│   ├── requirements.txt
│   ├── bootstrap/
│   │   ├── bootstrapServer.ts
│   │   ├── config/
│   │   ├── handlers/
│   │   ├── managers/
│   │   ├── models/
│   │   ├── network/
│   │   ├── protocol/
│   │   ├── rateLimit/
│   │   └── types/
│   └── test-join.js
├── assets/
├── docs/
└── README.md
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

## Project documents

- [Project.md](Project.md)
- [Architecture.md](Architecture.md)
- [PRD.md](PRD.md)
- [rules.md](rules.md)
- [phase.md](phase.md)
- [design.md](design.md)
- [memory.md](memory.md)
