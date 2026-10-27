import { BootstrapPacket } from "./protocol/bootstrapPacket";

import { MessageType } from "./types/MessageType";

export class BootstrapEventHandler {

    constructor(

        private readonly onPeerList:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onPeerJoined:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onPeerLeft:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onOffer:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onAnswer:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onIceCandidate:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onError:
            (packet: BootstrapPacket<unknown>) => void,

        private readonly onRoutingPacket:
            (packet: BootstrapPacket<unknown>) => void = () => undefined

    ) {}

    /**
     * Handle incoming packet.
     */
    public handle(
        raw: string
    ): void {
    let packet: BootstrapPacket<unknown>;

    try {
    packet = JSON.parse(raw);
    } catch {
    throw new Error("Invalid bootstrap packet.");
}
if (!packet.type) {
    throw new Error("Packet type missing.");
}

        switch (packet.type) {

            case MessageType.PEER_LIST:

                this.onPeerList(packet);
                break;

            case MessageType.PEER_JOINED:

                this.onPeerJoined(packet);
                break;

            case MessageType.PEER_LEFT:

                this.onPeerLeft(packet);
                break;

            case MessageType.OFFER:

                this.onOffer(packet);
                break;

            case MessageType.ANSWER:

                this.onAnswer(packet);
                break;

            case MessageType.ICE_CANDIDATE:

                this.onIceCandidate(packet);
                break;

            case MessageType.ERROR:

                this.onError(packet);
                break;

            case MessageType.FIND_CLOSEST_NODES:

            case MessageType.ANONYMOUS_SIGNAL:

            case MessageType.DATA_STORE:

            case MessageType.DATA_RETURN:

                this.onRoutingPacket(packet);
                break;

            default:

                console.warn(
                    `BootstrapEventHandler: unknown packet type: ${packet.type}`
                );
                return;

        }

    }

}
