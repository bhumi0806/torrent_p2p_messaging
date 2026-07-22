import { PeerConnection } from "./models/PeerConnection";
import { DataChannel } from "./models/DataChannel";

import { PeerId } from "../identity/valueObjects/PeerID";

export class WebRTCFactory {

    /**
     * Create a PeerConnection.
     */
    public static createPeerConnection(
        peerId: PeerId
    ): PeerConnection {

        const rtcConnection =
            new RTCPeerConnection({

                iceServers: [

                    {
                        urls: [
                            "stun:stun.l.google.com:19302",
                            "stun:stun1.l.google.com:19302",
                            "stun:stun2.l.google.com:19302"
                        ]
                    },
                    {
                        urls: [
                            "turn:openrelay.metered.ca:80",
                            "turn:openrelay.metered.ca:443",
                            "turn:openrelay.metered.ca:5349"
                        ],
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    }

                ],
                iceCandidatePoolSize: 0

            });

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