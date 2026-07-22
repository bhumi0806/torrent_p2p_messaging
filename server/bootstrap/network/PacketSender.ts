import WebSocket from "ws";

import { BootstrapPacket } from "../models/BootstrapPacket";
import { MessageType } from "../types/MessageType";

/**
 * Responsible for transmitting Bootstrap protocol
 * packets over WebSocket connections.
 *
 * This is the only class allowed to:
 *  - Serialize packets
 *  - Send packets
 */
export class PacketSender {
    [x: string]: any;

    /**
     * Send any Bootstrap packet.
     */
    public BootstrapPacket<T>(
        socket: WebSocket,
        packet: BootstrapPacket<T>
    ): void {

        socket.send(
            JSON.stringify(packet)
        );

    }

    /**
     * Backwards-compatible alias used by other server code.
     */
    public send<T>(socket: WebSocket, packet: BootstrapPacket<T>): void {
        this.BootstrapPacket(socket, packet);
    }

    /**
     * Send an ERROR packet.
     */
    public sendError(
        socket: WebSocket,
        message: string
    ): void {

        this.BootstrapPacket(
            socket,
            new BootstrapPacket(
                MessageType.ERROR,
                {
                    message
                }
            )
        );

    }

}