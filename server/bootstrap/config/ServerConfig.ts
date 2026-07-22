/**
 * Global configuration for the Bootstrap Server.
 *
 * This file contains only configuration values.
 * No business logic should exist here.
 */
export const ServerConfig = Object.freeze({

    /**
     * Host interface on which the Bootstrap Server listens.
     */
    HOST: process.env.BOOTSTRAP_HOST ?? "0.0.0.0",

    /**
     * Port on which the Bootstrap Server listens.
     */
    PORT: Number(process.env.BOOTSTRAP_PORT ?? 8080),

    /**
     * Maximum number of simultaneous peers.
     */
    MAX_PEERS: 1000,

    /**
     * Maximum WebSocket message size.
     * (64 KB)
     */
    MAX_MESSAGE_SIZE: 64 * 1024,

    /**
     * Interval for checking inactive peers.
     * (15 seconds)
     */
    HEARTBEAT_INTERVAL_MS: 15_000,

    /**
     * Peer is removed if no heartbeat
     * is received within this duration.
     * (30 seconds)
     */
    PEER_TIMEOUT_MS: 30_000,

    /**
     * Maximum length allowed for usernames.
     */
    MAX_USERNAME_LENGTH: 32,

    /**
     * Whether the bootstrap server should enable rate limiting.
     */
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED !== "false"

} as const);