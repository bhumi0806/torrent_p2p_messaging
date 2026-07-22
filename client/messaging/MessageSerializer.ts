import { Message } from "./models/Message";
import { MessageMetadata } from "./models/MessageMetadata";

import { EncryptedMessage } from "../encryption/models/EncryptedMessage";

import { PeerId } from "../identity/valueObjects/PeerID";

import { MessageType } from "./types/MessageType";
import { DeliveryStatus } from "./types/DeliveryStatus";

export class MessageSerializer {

    /**
     * Serialize a message.
     */
    public static serialize(
        message: Message
    ): string {

        return JSON.stringify(

            message.toJSON()

        );

    }

    /**
     * Deserialize a message.
     */
    public static deserialize(
        json: string
    ): Message {

        const object = JSON.parse(json);

        const metadata =
            new MessageMetadata(

                object.metadata.messageId,

                PeerId.fromString(
                    object.metadata.senderId
                ),

                PeerId.fromString(
                    object.metadata.receiverId
                ),

                object.metadata
                    .messageType as MessageType,

                object.metadata.timestamp,

                object.metadata
                    .deliveryStatus as DeliveryStatus

            );

        const payload =
            EncryptedMessage.fromJSON(

                object.payload

            );

        return new Message(

            metadata,

            payload

        );

    }

}