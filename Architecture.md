# Architecture

## Overview

Torrent P2P Messaging uses a layered architecture that separates signaling, transport, encryption, and application orchestration.

## High-level layers

### 1. Client application layer

The client entry point in [client/app.ts](client/app.ts) bootstraps the app and starts the application runtime. The main orchestration object in [client/integration/App.ts](client/integration/App.ts) wires together controllers and managers for login, bootstrap events, peer discovery, messaging, file transfer, heartbeat, and reconnection.

### 2. Transport and signaling layer

The bootstrap server in [server/bootstrap/bootstrapServer.ts](server/bootstrap/bootstrapServer.ts) manages WebSocket connections and packet dispatch. It is responsible for registration, signaling, and peer presence updates.

### 3. Domain modules

- bootstrap: handles WebSocket bootstrap communication and packet flow
- identity: creates and manages local identities and keys
- encryption: handles session keys, nonce generation, and encrypted payload handling
- messaging: manages chat message creation and incoming/outgoing delivery
- FileTransfer: handles chunking, assembly, serialization, and verification
- heartbeat: monitors liveness and sends periodic health packets
- reconnection: restores sessions after disconnects or rejoin events
- webrtc: manages peer connections, ICE candidates, and data channels

## Runtime flow

1. The client connects to the bootstrap server.
2. The server tracks peers and forwards signaling messages.
3. The client negotiates a WebRTC connection with another peer.
4. The messaging and file transfer modules run on top of the established data channel.
5. Heartbeat and reconnection logic monitor health and recover from interruptions.

## Design principles

- Keep modules focused around a single responsibility.
- Prefer explicit controller/manager boundaries over shared state sprawl.
- Keep crypto logic close to the encryption module.
- Treat transport errors as first-class events.
- Preserve clear separation between UI orchestration and networking concerns.

## Future direction

The architecture is intentionally extensible. The next evolution could include a stronger auth layer, database-backed state persistence, stronger key exchange mechanisms, and production-grade resilience features.
