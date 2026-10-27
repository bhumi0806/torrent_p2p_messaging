import WebSocket from "ws";

import { BootstrapPacket } from "../models/BootstrapPacket";

import { RegisterPayload } from "../protocol/RegisterPayload";
import { SignalPayload } from "../protocol/SignalPayload";

import { MessageType } from "../types/MessageType";

import { RegisterHandler } from "./RegisterHandler";
import { SignalHandler } from "./SignalHandler";
import { RoutingHandler } from "./RoutingHandler";

export class PacketDispatcher {

    constructor(
        private readonly registerHandler: RegisterHandler,
        private readonly signalHandler: SignalHandler,
        private readonly routingHandler?: RoutingHandler
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

            case MessageType.FIND_CLOSEST_NODES:
                this.routingHandler?.handleFindClosest(socket, packet.payload);
                break;

            case MessageType.ANONYMOUS_SIGNAL:
                this.routingHandler?.handleAnonymousSignal(socket, packet.payload);
                break;

            case MessageType.DATA_STORE:
                this.routingHandler?.handleDataStore(socket, packet.payload);
                break;

            case MessageType.DATA_RETURN:
                this.routingHandler?.handleDataReturn(socket, packet.payload);
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
