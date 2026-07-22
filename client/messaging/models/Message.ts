import { EncryptedMessage } from "../../encryption/models/EncryptedMessage";
import { MessageMetadata } from "./MessageMetadata";

export class Message {

    constructor(

        private readonly metadata: MessageMetadata,

        private readonly payload: EncryptedMessage

    ) {}

    /**
     * Get metadata.
     */
    public getMetadata(): MessageMetadata {

        return this.metadata;

    }

    /**
     * Get encrypted payload.
     */
    public getPayload(): EncryptedMessage {

        return this.payload;

    }

    /**
     * Serialize.
     */
    public toJSON(): object {

        return {

            metadata: {

                messageId:
                    this.metadata
                        .getMessageId(),

                senderId:
                    this.metadata
                        .getSenderId()
                        .toString(),

                receiverId:
                    this.metadata
                        .getReceiverId()
                        .toString(),

                messageType:
                    this.metadata
                        .getMessageType(),

                timestamp:
                    this.metadata
                        .getTimestamp(),

                deliveryStatus:
                    this.metadata
                        .getDeliveryStatus()

            },

            payload:
                this.payload
                    .toJSON()

        };

    }

}