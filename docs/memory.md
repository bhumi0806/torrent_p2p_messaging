# Memory

## Project context

- The project is a browser-based P2P messaging prototype with a modular TypeScript client and a Node.js WebSocket bootstrap server.
- The client contains modules for identity, encryption, messaging, WebRTC, file transfer, heartbeat, and reconnection.
- The server contains bootstrap handlers, peer management, signaling logic, and rate limiting.

## Working conventions

- Keep changes aligned with the current module structure.
- Prefer incremental improvements over refactors that change the architecture unexpectedly.
- Document significant changes in the project docs when behavior or structure changes.

## Current focus areas

- Stabilize peer connection flows.
- Improve error handling for network and handshake failure paths.
- Harden crypto and identity management practices.
- Add tests and verification for critical paths over time.
