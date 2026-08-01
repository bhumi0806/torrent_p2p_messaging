# Memory

## Project context

- The project is a browser-based P2P messaging prototype with a modular TypeScript client and a Node.js WebSocket bootstrap server.
- The client contains modules for identity, encryption, messaging, WebRTC, file transfer, heartbeat, and reconnection.
- The server contains bootstrap handlers, peer management, signaling logic, and rate limiting.
- Invite links, QR codes, and public-key fingerprints are handled by the client invite module.
- The next milestone is replacing always-required bootstrap signaling with invite-based peer records, peer exchange, and a browser-compatible DHT-style overlay.
- Session restore reloads the stored browser identity after refresh and reconnects to bootstrap automatically.

## Working conventions

- Keep changes aligned with the current module structure.
- Prefer incremental improvements over refactors that change the architecture unexpectedly.
- Document significant changes in the project docs when behavior or structure changes.
- For every feature or modification, keep docs updated with current architecture, assumptions, limitations, discovered problems, and improvement ideas.

## Current focus areas

- Stabilize peer connection flows.
- Improve error handling for network and handshake failure paths.
- Harden crypto and identity management practices.
- Improve invite-based peer verification and trust UX.
- Decouple discovery and signaling so bootstrap, invite, peer exchange, and DHT providers can coexist during migration.
- Improve refresh recovery by restoring peer connections and message history after identity restore.
- Add tests and verification for critical paths over time.

## Recent notes

- Invite mechanism documentation lives in [invite-mechanism.md](invite-mechanism.md).
- DHT and peer exchange migration documentation lives in [dht-peer-exchange-milestone.md](dht-peer-exchange-milestone.md).
- Session restore documentation lives in [session-restore.md](session-restore.md).
- QR codes currently use a public image endpoint and should be replaced with local QR generation before production use.
- `PrivateIdentity.getPrivateIdentity()` exists for compatibility because the runtime context stores private identity objects directly.
