import WebSocket from "ws";

import { BootstrapPacket } from "../models/BootstrapPacket";

import { RegisterPayload } from "../protocol/RegisterPayload";
import { SignalPayload } from "../protocol/SignalPayload";

import { MessageType } from "../types/MessageType";

import { RegisterHandler } from "./RegisterHandler";
import { SignalHandler } from "./SignalHandler";

export class PacketDispatcher {

    constructor(
        private readonly registerHandler: RegisterHandler,
        private readonly signalHandler: SignalHandler
    ) {}

    public dispatch(
        socket: WebSocket,
        packet: BootstrapPacket<unknown>
    ): void {

        switch (packet.type) {

            case MessageType.REGISTER:

                this.registerHandler.handle(
                    socket,
                    packet as BootstrapPacket<RegisterPayload>
                );

                break;

            case MessageType.OFFER:

            case MessageType.ANSWER:

            case MessageType.ICE_CANDIDATE:

                this.signalHandler.handle(
                    socket,
                    packet as BootstrapPacket<SignalPayload>
                );

                break;

default:
    console.warn(`Unsupported packet type: ${packet.type}`);
    return;

        }

    }

}