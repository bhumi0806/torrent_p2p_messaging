import { PeerId } from "../identity/valueObjects/PeerID";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

export class ConnectionRestorer {

    constructor(

        private readonly webRTCManager: WebRTCManager

    ) {}

    /**
     * Restore a WebRTC connection.
     */
    public async restore(

        peerId: PeerId,

        oldConnection: PeerConnection

    ): Promise<PeerConnection> {

        oldConnection.close();

        this.webRTCManager.removeConnection(
            peerId
        );

        const newConnection =

            this.webRTCManager.createConnection(
                peerId
            );

        const dataChannel =

            this.webRTCManager.createDataChannel(

                newConnection,

                "bleep"

            );

        if (

            dataChannel.getChannel().readyState !==
            "connecting"

        ) {

            throw new Error(

                "Failed to create secure DataChannel."

            );

        }

        const offer =

            await this.webRTCManager.createOffer(

                newConnection

            );

        if (

            !offer.sdp ||

            offer.type !== "offer"

        ) {

            throw new Error(

                "Invalid WebRTC offer."

            );

        }

        return newConnection;

    }

}