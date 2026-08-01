# Session Restore

## Current Architecture

- Browser identity keys are stored in `localStorage` through `IdentityStorage`.
- The last username is stored separately as `bleep.username` so the login field can be restored even if full identity restore fails.
- On page refresh, the browser drops the WebSocket and WebRTC data channels.
- The client now reloads the stored identity on startup and reconnects to the bootstrap server automatically.
- The username field is refilled from the restored identity.
- The bootstrap server treats `REGISTER` as a presence/reconnect operation and applies the public rate-limit bucket.

## Assumptions

- Refresh should preserve identity, username, peer ID, public key, and invite/fingerprint information.
- The username field should stay filled after refresh even when the bootstrap server is temporarily unreachable.
- Refresh cannot preserve active WebRTC data channels because the page runtime is restarted.
- Reconnecting to the bootstrap server after refresh is expected and should not be treated like repeated failed authentication.
- A user who wants a different username or identity can still enter a new username through the login flow.

## Limitations

- Active peer connections are not automatically restored after refresh yet.
- Chat history is still in memory and disappears on refresh.
- The stored private identity remains in browser `localStorage`; this is convenient for the prototype but not ideal for production security.
- The bootstrap server still needs to be reachable after refresh, either locally, through a tunnel, or through a deployed endpoint.

## Problems Discovered

- The app saved identity data but did not auto-load it on startup.
- The username field depended on full identity restore, so any restore failure left the field blank.
- The login flow cleared stored identity before creating a login, which made refresh feel like account loss.
- The server classified `REGISTER` as an auth operation, so repeated refreshes could trigger the strict auth rate limit.
- The actual runtime identity object is a `PrivateIdentity`, so restore paths must use that shape consistently.
- The root TypeScript config included generated `client/dist` output, which could make server builds race against client builds.

## Ideas For Improvements

- Add an explicit Logout or Reset Identity button.
- Persist recent conversations in IndexedDB.
- Restore recent peer connections after refresh when peers are still online.
- Move private key storage behind WebCrypto or encrypted storage before production use.
- Split future server rate limits by real authentication, presence registration, and signaling traffic.
- Keep generated build directories excluded from TypeScript project inputs.
