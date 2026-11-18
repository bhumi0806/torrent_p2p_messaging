# Cross-device WebRTC connectivity test

## Current verified configuration

- The client creates `RTCPeerConnection` in `client/webrtc/WebRTCFactory.ts` using `resolveWebRTCConfiguration()` from `client/webrtc/webrtcConfig.ts`.
- ICE candidates are trickled individually through the existing bootstrap WebSocket. `ConnectionController` sends local candidates; received candidates are queued until a peer connection and remote description exist.
- The bootstrap server relays offers, answers, and candidates. It listens on `0.0.0.0:8080` by default; that does not make it internet reachable by itself.
- The app has no deployment manifest or configured public bootstrap hostname in this repository. The client default `ws://localhost:8080` is suitable only for local development. Use `VITE_BOOTSTRAP_URL` or the `?server=wss://...` override on each client.
- Default ICE servers are public Google STUN entries. The previous hardcoded OpenRelay TURN endpoint and its public credentials have been removed. A production TURN service is not provisioned by this repository.
- `VITE_ICE_SERVERS_JSON` is bundled into the client. It may contain ICE server URLs and short-lived TURN credentials, but it must not contain a permanent TURN secret. The app also accepts runtime-injected `window.__ICE_SERVERS__` configuration for a deployment that can securely obtain expiring credentials.

## Expose a temporary test environment

No existing deployment is configured. For a temporary test, use an HTTPS frontend origin and a separately reachable WSS bootstrap URL. A Cloudflare Quick Tunnel can provide temporary URLs if `cloudflared` is installed and available to the operator. These commands publish the local services to the internet; use them only with test identities and shut them down after the test.

1. Start the bootstrap server from `server/` with the normal rate limiting enabled:

   ```powershell
   npm run dev
   ```

2. In a separate terminal, expose only the bootstrap listener:

   ```powershell
   cloudflared tunnel --url http://localhost:8080
   ```

   Copy its temporary `https://...` URL and use the equivalent `wss://...` URL for the clients. Cloudflare terminates TLS; the local bootstrap process remains on loopback for this setup.

3. Build and preview the client from `client/`:

   ```powershell
   npm run build
   npm run preview -- --host 127.0.0.1 --port 4173
   ```

   In another terminal, expose that HTTPS frontend:

   ```powershell
   cloudflared tunnel --url http://localhost:4173
   ```

4. Open the frontend's temporary HTTPS URL on both devices, each in a separate browser profile/session. Append `?server=wss://<bootstrap-tunnel-host>` to both URLs. Log in with separate test usernames and verify that each device sees the other online before starting a WebRTC connection.

Quick Tunnel addresses change when restarted and are not a production deployment. For a lasting test, deploy the client over HTTPS and the bootstrap service behind WSS using an owned hostname, monitored server, and appropriate rate limits.

## ICE server setup

STUN can reveal server-reflexive candidates but cannot relay traffic through every NAT/firewall. For a restrictive-network test, provision an owned or managed TURN service. Configure UDP/TCP and TLS transports supported by that provider, and use its short-lived credentials. The credential issuer and TURN service are infrastructure requirements; neither is implemented here. Do not use the former hardcoded public relay credentials or put a permanent TURN secret in a Vite variable.

Set the ICE server JSON while building the client, or inject equivalent runtime configuration before the app loads. For example, with temporary values supplied by the TURN provider:

```powershell
$env:VITE_ICE_SERVERS_JSON='[{"urls":["stun:stun.example.net:3478"]},{"urls":["turn:turn.example.net:3478?transport=udp","turns:turn.example.net:5349"],"username":"<short-lived-username>","credential":"<short-lived-credential>"}]'
$env:VITE_ICE_TRANSPORT_POLICY='all'
npm run build
```

The example hostnames and credentials are placeholders. Because Vite embeds these values in the browser build, the TURN credentials must expire quickly and be scoped according to the provider's guidance. To test TURN-only without rebuilding, append `&iceTransportPolicy=relay` to a URL that already has the `?server=...` parameter. Remove that query parameter for normal `all` policy testing.

## Diagnostics and test procedure

Open each browser's developer console and filter for `[WebRTC diagnostics]`. The client reports signaling, gathering, ICE and peer-connection states; data-channel open/close/error; candidate types and protocols; the selected candidate pair's local/remote candidate types; and elapsed setup time or a 30-second establishment timeout. Logs omit candidate IP addresses, ICE credentials, public/private keys, and message content.

For each scenario, save sanitized console output from both devices and record:

| Field | Expected evidence |
| --- | --- |
| Bootstrap | Both clients register with the same reachable WSS endpoint and see the other online. |
| ICE gathering | `ice-gathering-state` reaches `complete` or a candidate-pair connection completes. |
| WebRTC | `iceConnectionState` is `connected`/`completed`, `connectionState` is `connected`, channel is `open`. |
| Candidate pair | `localCandidateType` and `remoteCandidateType` identify `host`, `srflx`, or `relay`; `relay` means TURN transport. |
| Encrypted chat | Send a unique test message; recipient sees the sender identity; sender reports a destination-accepted delivery status. Do not copy message text into diagnostic reports. |
| Failure/recovery | Note state transitions and whether manual reconnect is needed after network changes or tab closure. |

Run these cases in order and record **Pass**, **Fail**, or **Not run** with device/browser/network details:

1. Two physical devices on the same Wi-Fi.
2. Two devices on different networks.
3. One device on Wi-Fi and one on a mobile hotspot.
4. Temporarily disable/re-enable one device's network, then attempt recovery.
5. Close a peer tab, reopen it, and reconnect.
6. Repeat a different-network case with `iceTransportPolicy=relay` and confirm the selected pair is relayed.
7. Test a restrictive NAT/firewall only where such a network is available.

The Playwright suite is useful for local Chromium regressions, but it runs browser contexts on one machine and is not evidence for any of the physical-device scenarios above. No physical-device results are recorded by this repository audit.
