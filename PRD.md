# Product Requirements Document

## Product summary

Torrent P2P Messaging is a browser-based prototype for secure, direct communication between peers. The product should enable users to discover each other, connect through WebRTC, exchange encrypted messages, and transfer files while keeping the backend lightweight and modular.

## Goals

- Provide a functional demo of a P2P messaging experience.
- Support peer discovery and direct communication without requiring a centralized message relay for normal traffic.
- Demonstrate secure message exchange through client-side encryption.
- Keep the implementation understandable and extendable for future product work.

## User stories

- As a user, I want to join the network with a username so that I can appear online to other peers.
- As a user, I want to view existing peers so that I can choose someone to connect to.
- As a user, I want to start a direct connection so that my messages travel peer-to-peer.
- As a user, I want my messages to be encrypted so that sensitive content is protected.
- As a user, I want file transfer and heartbeat support so that the experience feels resilient.

## Functional requirements

1. Bootstrap registration and peer discovery
2. WebRTC signaling and direct data-channel messaging
3. Identity generation and persistence
4. Encryption for chat payloads
5. File transfer support
6. Heartbeat and reconnection logic
7. Graceful handling of malformed or failed network events

## Non-functional requirements

- Maintain clear separation of responsibilities across modules.
- Prefer maintainable TypeScript code over quick hacks.
- Ensure error handling covers network failures and protocol mismatches.
- Keep the runtime simple enough to run locally with standard developer tools.

## Out of scope for now

- Full user authentication and accounts
- Persistent storage for conversation history
- Production-grade TURN/STUN infrastructure
- Enterprise-grade key management
