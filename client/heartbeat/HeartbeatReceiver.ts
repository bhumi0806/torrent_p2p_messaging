import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";
import { EncryptedMessage } from "../encryption/models/EncryptedMessage";

import { HeartbeatPacket } from "./models/HeartbeatPacket";
import { HeartbeatMonitor } from "./HeartbeatMonitor";

export class HeartbeatReceiver {

    public static readonly MAX_CLOCK_SKEW =
        30000; // 30 seconds

    private readonly processedNonces =
        new Set<string>();

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly heartbeatMonitor: HeartbeatMonitor

    ) {}

    /**
     * Receive heartbeat.
     */
    public receive(

        senderId: PeerId,

        encryptedHeartbeat: string

    ): void {

        const encryptedMessage =

            EncryptedMessage.fromJSON(

                JSON.parse(

                    encryptedHeartbeat

                )

            );

        const plaintext =

            this.encryptionManager.decrypt(

                senderId,

                encryptedMessage

            );

        const packet =

            HeartbeatPacket.fromJSON(

                JSON.parse(

                    plaintext

                )

            );

        if (

            !packet
                .getSenderId()
                .equals(senderId)

        ) {

            throw new Error(

                "Sender identity mismatch."

            );

        }

        if (

            this.processedNonces.has(

                packet.getNonce()

            )

        ) {

            throw new Error(

                "Replay attack detected."

            );

        }

        this.processedNonces.add(

            packet.getNonce()

        );

        const now = Date.now();

        if (

            Math.abs(

                now -

                packet.getTimestamp()

            )

            >

            HeartbeatReceiver.MAX_CLOCK_SKEW

        ) {

            throw new Error(

                "Heartbeat timestamp expired."

            );

        }

        this.heartbeatMonitor.updateHeartbeat(

            senderId

        );

    }

}