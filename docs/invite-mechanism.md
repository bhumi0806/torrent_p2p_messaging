# Invite Mechanism

## Current Architecture

- Invites are generated on the client by `client/invites/InviteManager.ts`.
- An invite contains the peer ID, username, public identity key, public-key fingerprint, bootstrap URL, and invite version.
- Invite links use the `invite` query parameter with a base64url-encoded JSON payload.
- QR codes are rendered from the invite link in the client UI.
- The existing bootstrap server remains the source of live peer presence.
- The connection flow still requires the invited peer to be online in the bootstrap peer list.
- Before connecting from an invite, the client verifies that the invite public key hashes back to the invite peer ID.
- Before connecting to an online peer, the client checks that the online peer public key matches the verified invite public key.

## Assumptions

- Peer IDs are derived from public identity keys and can be used to bind an invite to a key.
- Invite contents are public metadata and do not include private keys or session keys.
- Users can exchange invite links, QR codes, or fingerprints out of band.
- The bootstrap URL in an invite is informational for now; runtime bootstrap selection still uses the current app configuration and `bootstrapUrl` query support.
- QR generation can use a public image endpoint during the prototype phase.

## Limitations

- QR generation currently depends on `api.qrserver.com`, so it leaks invite metadata to that provider and does not work offline.
- Invite links are not signed separately; integrity is checked by recomputing the peer ID and fingerprint from the included public key.
- Fingerprint comparison is manual. The UI shows the fingerprint, but there is no dedicated safety-number ceremony yet.
- Invites do not automatically switch the app to the invite bootstrap URL.
- Invites do not provide offline delivery or rendezvous. Both peers must still be online through the same reachable bootstrap server.
- A malicious bootstrap directory can still hide peers or refuse signaling. It should not be able to substitute a different key for an invited peer without triggering a mismatch.

## Problems Discovered

- The application context stores the private identity object at runtime, while some types implied it stored the `Identity` wrapper. `PrivateIdentity.getPrivateIdentity()` was added as a compatibility method so encryption and invite code can use the same runtime object.
- The previous E2EE change depended on `getPrivateIdentity()` existing at runtime. The invite work exposed that mismatch before browser testing.
- The current UI is still a compact prototype UI, so invite actions are functional but not yet polished into a full onboarding flow.

## Ideas For Improvements

- Replace the public QR image service with an in-repo QR encoder to avoid metadata leakage and offline failure.
- Add a fingerprint verification screen with side-by-side local and remote safety numbers.
- Add signed invite payloads using the Ed25519 identity key.
- Add invite expiration, single-use invites, or room/session labels.
- Let accepted invite links set `bootstrapUrl` automatically after user confirmation.
- Add tests for invite encode/decode, fingerprint verification, and public-key mismatch rejection.
