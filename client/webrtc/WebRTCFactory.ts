import { PeerConnection } from "./models/PeerConnection";
import { DataChannel } from "./models/DataChannel";
import { resolveWebRTCConfiguration } from "./webrtcConfig";

import { PeerId } from "../identity/valueObjects/PeerID";

export class WebRTCFactory {

    /**
     * Create a PeerConnection.
     */
    public static createPeerConnection(
        peerId: PeerId
    ): PeerConnection {

        const rtcConnection =
            new RTCPeerConnection(
                resolveWebRTCConfiguration()
            );

        return new PeerConnection(

            peerId,

            rtcConnection

        );

    }

    /**
     * Create a DataChannel.
     */
    public static createDataChannel(
        peerConnection: PeerConnection,
        label: string = "bleep"
    ): DataChannel {

        const rtcDataChannel =
            peerConnection
                .getConnection()
                .createDataChannel(label);

        return new DataChannel(

            peerConnection.getPeerId(),

            rtcDataChannel

        );

    }

}
