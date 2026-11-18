# DHT And Peer Exchange Milestone

## Current Architecture

- The app currently depends on the bootstrap WebSocket server for presence and WebRTC signaling.
- Browser clients discover online peers through the bootstrap peer list.
- Browser clients exchange WebRTC offers, answers, and ICE candidates through the bootstrap server.
- Once WebRTC connects, chat and file payloads move over encrypted data channels.
- Invite links now provide peer identity metadata and public-key fingerprints, but they do not replace signaling yet.
- Open WebRTC data channels exchange up to 64 peer identity records. Recipients recompute each peer ID from its public key before merging the record into their local peer directory and using it for neighbor selection.
- `FreenetEngine.findClosestPeer` now uses full 256-bit XOR distance, which is the expected key distance for DHT-style lookup. It remains a utility and is not yet on the messaging or discovery path.

## Target Architecture

- Remove the always-required bootstrap signaling server from the normal connection path.
- Use invite links, QR codes, and fingerprints to exchange identity and initial routing hints.
- Build a browser-compatible peer overlay on top of WebRTC data channels.
- Use peer exchange so connected peers can share known peer records with each other.
- Use a DHT-like routing table to find peers by peer ID through the overlay.
- Keep TURN available for WebRTC relay when direct peer paths fail.

## Assumptions

- Browser clients cannot directly participate in a traditional UDP-based BitTorrent DHT because browsers do not expose raw UDP/TCP sockets.
- A browser DHT must run over browser-supported transports such as WebRTC data channels or WebTransport.
- WebRTC still needs some signaling path before two unknown browsers can connect.
- Invites can become the first rendezvous mechanism by carrying identity, fingerprint, bootstrap URL or peer hints, and later relay hints.
- Peer exchange can reduce central dependency after the first connection is established.
- A small temporary bootstrap path may still be useful during migration, but the long-term goal is to make it optional.

## Proposed Phases

### Phase 1 - Discovery Abstraction

- Introduce a discovery interface used by the app instead of calling the bootstrap client directly.
- Implement the current bootstrap server as one discovery provider.
- Add a second provider for invite-based peer records.
- Keep current behavior working while making discovery replaceable.

### Phase 2 - Peer Record Format

- Define a signed peer record containing peer ID, username, public key, fingerprint, supported transports, last-seen timestamp, and optional relay hints.
- Add validation that the peer ID matches the public key.
- Add signatures so peers can reject modified records.
- Store recently seen peer records locally.

### Phase 3 - Peer Exchange

- After a WebRTC data channel opens, peers exchange signed peer records for known peers.
- Merge peer records into a local peer store.
- Reject records with invalid signatures, mismatched peer IDs, or stale timestamps.
- Add UI indicators for invited, verified, discovered, and connected peers.

### Phase 4 - Overlay Routing

- Build a DHT-like routing table over connected WebRTC peers.
- Route lookup requests by target peer ID.
- Let peers return closer known peers or direct contact hints.
- Add loop prevention, hop limits, and request IDs.

### Phase 5 - Serverless Signaling Experiments

- Use invite links and known peer exchange to find signaling relays.
- Allow connected peers to relay signaling messages for others.
- Explore WebRTC connection establishment through trusted peer relays.
- Keep TURN as a transport relay, not as an identity or discovery authority.

## Limitations

- Fully removing the bootstrap server is not the same as removing all rendezvous needs. Unknown browsers still need a way to find at least one live peer.
- Peer exchange only works after a peer has already joined some part of the network.
- A DHT over WebRTC depends on the availability and churn behavior of already-connected peers.
- Public invite links can leak metadata unless the invite payload is minimized or encrypted for a recipient.
- Browser tabs sleep, mobile browsers suspend background work, and users close pages, so availability is weaker than a native P2P node.
- WebRTC signaling relay through peers increases complexity and needs abuse prevention.

## Centralized Responsibilities Still To Replace

- **Presence:** the bootstrap server is the only authority for who is currently online. Overlay records are hints and may be stale; the data channel must confirm reachability.
- **Initial rendezvous and signaling:** new peers still require the server to deliver OFFER, ANSWER, and ICE_CANDIDATE. A browser cannot form a WebRTC channel with an unknown peer without exchanging signaling data through some reachable path.
- **Initial directory:** clients get their first set of peer records from the server. Peer exchange only expands the directory after an overlay link exists.
- **Lookup:** `FreenetEngine` can rank 256-bit keys, but it does not query or route through the overlay. `SmallWorldRouter` routes by a public-key-derived unit-ring coordinate and is not yet a complete DHT lookup protocol.

## Problems Discovered

- The term "DHT" can imply BitTorrent-style UDP networking, but this project is browser-first and cannot use that transport directly.
- Removing the bootstrap server requires separating three responsibilities that are currently bundled together: presence, peer discovery, and WebRTC signaling.
- The invite mechanism provides identity verification but not live reachability by itself.
- A real no-server path needs a local peer store and a peer-record protocol before overlay routing can be useful.

## Ideas For Improvements

- Add a `DiscoveryProvider` interface with bootstrap, invite, peer-exchange, and DHT implementations.
- Add signed peer records using the existing Ed25519 identity key.
- Add a local persistent peer store in IndexedDB.
- Add a peer-exchange message type over the existing data channel.
- Add optional friend-to-friend mode where only verified invite peers are exchanged.
- Add safety controls for relay behavior, including rate limits, hop limits, and manual trust settings.
- Investigate a future native helper or desktop wrapper if true UDP DHT participation becomes a requirement.

## Current Verification

- The client production build and repository TypeScript check pass.
- The server transport integration check uses three independent WebSocket clients, verifies registration and offer/answer relay, then disconnects peers individually and verifies the remaining clients stay connected and receive peer-left events.
- This does not exercise real browser WebRTC channels or cross-device NAT traversal. Those checks still require separate browser/device instances and a reachable ICE/TURN setup.
