/**
 * All packet types exchanged between
 * the Bootstrap Server and clients.
 *
 * These packets are only used during
 * peer discovery and WebRTC signaling.
 */
export enum MessageType {

    /**
     * Client → Server
     *
     * Register a newly connected peer.
     */
    REGISTER = "REGISTER",

    /**
     * Server → Client
     *
     * Sent once after successful registration.
     * Contains every currently connected peer.
     */
    PEER_LIST = "PEER_LIST",

    /**
     * Server → Clients
     *
     * Broadcast when a new peer joins.
     */
    PEER_JOINED = "PEER_JOINED",

    /**
     * Server → Clients
     *
     * Broadcast when a peer disconnects.
     */
    PEER_LEFT = "PEER_LEFT",

    /**
     * Client → Server → Client
     *
     * Forward a WebRTC SDP Offer.
     */
    OFFER = "OFFER",

    /**
     * Client → Server → Client
     *
     * Forward a WebRTC SDP Answer.
     */
    ANSWER = "ANSWER",

    /**
     * Client → Server → Client
     *
     * Forward an ICE Candidate.
     */
    ICE_CANDIDATE = "ICE_CANDIDATE",

    FIND_CLOSEST_NODES = "FIND_CLOSEST_NODES",
    ANONYMOUS_SIGNAL = "ANONYMOUS_SIGNAL",
    DATA_STORE = "DATA_STORE",
    DATA_RETURN = "DATA_RETURN",

    /**
     * Server → Client
     *
     * Indicates an invalid request
     * or server-side processing error.
     */
    ERROR = "ERROR"
}
