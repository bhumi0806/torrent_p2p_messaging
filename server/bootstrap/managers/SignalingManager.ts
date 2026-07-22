import { PeerManager } from "./PeerManager";
import { SignalMessage } from "../models/SignalMessage";
import { BootstrapPacket } from "../models/BootstrapPacket";
import { PacketSender } from "../network/PacketSender";

/**
 * Responsible for forwarding signaling packets
 * between connected peers.
 *
 * This class has no knowledge of WebRTC.
 * It simply routes packets.
 */
export class SignalingManager {
    [x: string]: any;

    private readonly peerManager: PeerManager;
    private readonly packetSender: PacketSender;

    constructor(
        peerManager: PeerManager,
        packetSender: PacketSender
    ) {

        this.peerManager = peerManager;
        this.packetSender = packetSender;

    }

    /**
     * Forward a signaling packet
     * to the destination peer.
     *
     * Returns true if forwarding succeeded.
     */
    public forwardSignal(
        signal: SignalMessage
    ): boolean {

        const targetPeer = this.peerManager.findPeer(
            signal.targetPeerId
        );

        if (!targetPeer) {
            return false;
        }

        const packet = new BootstrapPacket(
            signal.type,
            {
                senderPeerId: signal.senderPeerId,
                payload: signal.payload
            }
        );

        this.packetSender.send(
            targetPeer.getSocket(),
            packet
        );

        return true;

    }

}