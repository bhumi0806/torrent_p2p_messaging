
import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";
import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { HeartbeatPacket } from "./models/HeartbeatPacket";
import { ApplicationContext } from "../integration/ApplicationContext";
import { createRandomId } from "../utils/createRandomId";

export class HeartbeatSender {

    private sequenceNumber = 0;

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly webRTCManager: WebRTCManager,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Send heartbeat.
     */
    public send(

        connection: PeerConnection,

        receiverId: PeerId

    ): void {

        const identity = this.context.getIdentity();

    if (!identity) {
    throw new Error("Identity not initialized.");
}

        const packet =

            new HeartbeatPacket(

                identity.getPeerId(),

                ++this.sequenceNumber,

                Date.now(),

                createRandomId()

            );

        const encrypted =

            this.encryptionManager.encrypt(

                receiverId,

                JSON.stringify(

                    packet.toJSON()

                )

            );

        const dataChannel =

            this.webRTCManager.createDataChannel(

                connection,

                "heartbeat"

            );

        dataChannel.send(

            JSON.stringify(

                encrypted.toJSON()

            )

        );

    }

}
