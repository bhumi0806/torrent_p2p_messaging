import { PeerId } from "../identity/valueObjects/PeerID";
import { EncryptionManager } from "../encryption/EncryptionManager";
import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";
import { Message } from "./models/Message";
import { MessageMetadata } from "./models/MessageMetadata";
import { MessageSerializer } from "./MessageSerializer";
import { MessageType } from "./types/MessageType";
import { DeliveryStatus } from "./types/DeliveryStatus";
import { ApplicationContext } from "../integration/ApplicationContext";
import { createRandomId } from "../utils/createRandomId";

export class MessageSender {

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly webRTCManager: WebRTCManager,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Send a text message.
     */
    public async send(

        connection: PeerConnection,

        receiverId: PeerId,

        plaintext: string

    ): Promise<void> {

        const encryptedMessage =

            this.encryptionManager.encrypt(

                receiverId,

                plaintext

            );

        const metadata =

            new MessageMetadata(

                createRandomId(),

                this.context.getIdentity()!.getPeerId(),

                receiverId,

                MessageType.TEXT,

                Date.now(),

                DeliveryStatus.ENCRYPTED

            );

        const message =

            new Message(

                metadata,

                encryptedMessage

            );

        const serialized =

            MessageSerializer.serialize(

                message

            );

        const dataChannel =

            this.context.getDataChannel(

                receiverId

            );

        if (!dataChannel) {
            throw new Error(
                "Chat DataChannel is not available yet."
            );
        }

        await dataChannel.waitUntilOpen();

        dataChannel.send(
            JSON.stringify({
                kind: "chat",
                payload: serialized
            })
        );

        metadata.setDeliveryStatus(

            DeliveryStatus.SENT

        );

    }

}
