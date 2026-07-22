1. # Project Overview

## Purpose

Torrent P2P Messaging is a modular prototype for secure peer-to-peer communication in the browser. It combines WebRTC, encryption, peer discovery, and a lightweight bootstrap server to simulate a practical messaging network without requiring a central message relay for normal chat traffic.

## Goals

- Build a clear, maintainable client architecture for P2P messaging.
- Support peer discovery and signaling through a simple bootstrap server.
- Keep encryption and transport concerns separated from UI orchestration.
- Make the project suitable for future expansion into file transfer, presence, and production-grade security features.

## Current scope

- Username-based login and bootstrap registration
- Peer discovery and signaling
- WebRTC data-channel messaging
- Client-side encryption and identity management
- File transfer, heartbeat, and reconnect workflows
- Basic rate limiting on the bootstrap server

## Constraints

- The project is a prototype and should remain lightweight.
- The architecture should favor modularity over premature abstraction.
- New features should fit the existing domain structure instead of introducing a new runtime stack.
- Security improvements should be incremental and clearly documented.

## Current priorities

1. Stabilize peer connection flows.
2. Improve error handling and resilience around failed handshakes.
3. Harden encryption and identity management.
4. Add automated validation and test coverage for key workflows.

## Notes

The current codebase is organized around domain modules such as bootstrap, identity, encryption, messaging, file transfer, heartbeat, reconnection, and WebRTC. These modules should stay aligned with the architecture and documentation in this repository.