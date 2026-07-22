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

export class MessageSender {

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly webRTCManager: WebRTCManager,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Send a text message.
     */
    public send(

        connection: PeerConnection,

        receiverId: PeerId,

        plaintext: string

    ): void {

        const encryptedMessage =

            this.encryptionManager.encrypt(

                receiverId,

                plaintext

            );

        const metadata =

            new MessageMetadata(

                crypto.randomUUID(),

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

            this.webRTCManager.createDataChannel(

                connection

            );

        dataChannel.send(

            serialized

        );

        metadata.setDeliveryStatus(

            DeliveryStatus.SENT

        );

    }

}