import { MessageType } from "../types/MessageType";

/**
 * Represents one protocol packet exchanged
 * between the Bootstrap Server and clients.
 *
 * Every message follows the same structure:
 *
 * {
 *    type,
 *    payload
 * }
 */
export class BootstrapPacket<T = unknown> {

    /**
     * Packet type.
     */
    public readonly type: MessageType;

    /**
     * Packet payload.
     */
    public readonly payload: T;

    constructor(
        type: MessageType,
        payload: T
    ) {

        this.type = type;
        this.payload = payload;

        Object.freeze(this);

    }

}