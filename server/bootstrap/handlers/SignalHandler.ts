import WebSocket from "ws";

import { SignalMessage } from "../models/SignalMessage";
import { SignalingManager } from "../managers/SignalingManager";
import { PacketSender } from "../network/PacketSender";

import { MessageType } from "../types/MessageType";
import { BootstrapPacket } from "../models/BootstrapPacket";
import { SignalPayload } from "../protocol/SignalPayload";

export class SignalHandler {

    private readonly signalingManager: SignalingManager;

    private readonly packetSender: PacketSender;

    constructor(
        signalingManager: SignalingManager,
        packetSender: PacketSender
    ) {

        this.signalingManager = signalingManager;
        this.packetSender = packetSender;

    }

    /**
     * Handle OFFER / ANSWER / ICE packets.
     */
    public handle(
        socket: WebSocket,
        packet: any
    ): void {

        if (!this.isValidSignal(packet)) {

            this.packetSender.sendError(
                socket,
                "Invalid signaling packet."
            );

            return;

        }

        const signal = new SignalMessage(

            packet.payload.senderPeerId,

            packet.payload.targetPeerId,

            packet.type,

            packet.payload.payload

        );

        const success =
            this.signalingManager.forwardSignal(signal);

        if (!success) {

            this.packetSender.sendError(

                socket,

                "Target peer not found."

            );

        }

    }

    /**
     * Validate signaling packet.
     */
    private isValidSignal(packet: BootstrapPacket<SignalPayload>): boolean {

        if (!packet) {

            return false;

        }

        if (

            packet.type !== MessageType.OFFER &&

            packet.type !== MessageType.ANSWER &&

            packet.type !== MessageType.ICE_CANDIDATE

        ) {

            return false;

        }

        if (!packet.payload) {

            return false;

        }

        if (

            typeof packet.payload.senderPeerId !== "string" ||
            packet.payload.senderPeerId.length < 3 ||
            packet.payload.senderPeerId.length > 64

        ) {

            return false;

        }

        if (

            typeof packet.payload.targetPeerId !== "string" ||
            packet.payload.targetPeerId.length < 3 ||
            packet.payload.targetPeerId.length > 64

        ) {

            return false;

        }

        if (
            typeof packet.payload.payload !== "string" &&
            typeof packet.payload.payload !== "object"
        ) {
            return false;
        }

        return true;

    }

}