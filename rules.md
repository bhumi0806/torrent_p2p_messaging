# Project Rules

## Development rules

- Keep the architecture modular and domain-oriented.
- Use existing folders such as bootstrap, identity, encryption, messaging, webrtc, and reconnection before introducing new abstractions.
- Prefer small focused classes and managers over large files with mixed responsibilities.
- Keep networking, security, and UI concerns separated.

## Library and runtime guidance

- Use TypeScript for the client and server implementation.
- Use Vite for local client development.
- Use Node.js and the WebSocket package for the bootstrap server.
- Use libsodium-wrappers for cryptographic primitives.
- Keep dependencies minimal and well-justified.

## AI boundaries

- The AI assistant should not invent a new architecture unless the existing structure clearly supports it.
- The AI assistant should not replace established modules without a clear reason.
- The AI assistant should not introduce heavy frameworks unless the project already depends on them.
- The AI assistant should not change security behavior without documenting the rationale.

## Error handling expectations

- Invalid packets should be rejected safely.
- Connection failures should be surfaced through existing event or controller paths.
- Crypto operations should fail gracefully and avoid crashing the app.
- Logging should be clear enough to diagnose runtime issues without exposing sensitive data.

## Implementation checklist

- Preserve existing module boundaries.
- Add or update documentation when behavior changes.
- Verify that new code compiles and runs locally before considering it complete.
