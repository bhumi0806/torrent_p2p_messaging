import { MessageType } from "../types/MessageType";

/**
 * Represents a signaling message that is forwarded
 * between two peers by the Bootstrap Server.
 *
 * The Bootstrap Server does not inspect the payload.
 * It only forwards it to the target peer.
 */
export class SignalMessage {

    /**
     * Peer sending the message.
     */
    public readonly senderPeerId: string;

    /**
     * Destination peer.
     */
    public readonly targetPeerId: string;

    /**
     * OFFER / ANSWER / ICE_CANDIDATE
     */
    public readonly type: MessageType;

    /**
     * Opaque signaling payload.
     *
     * Bootstrap never interprets it.
     */
    public readonly payload: unknown;

    constructor(
        senderPeerId: string,
        targetPeerId: string,
        type: MessageType,
        payload: unknown
    ) {

        this.senderPeerId = senderPeerId;
        this.targetPeerId = targetPeerId;
        this.type = type;
        this.payload = payload;

        Object.freeze(this);

    }

}