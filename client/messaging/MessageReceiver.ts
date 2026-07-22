import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { Message } from "./models/Message";

import { MessageSerializer } from "./MessageSerializer";

export class MessageReceiver {

    constructor(

        private readonly encryptionManager: EncryptionManager

    ) {}

    /**
     * Receive a message.
     */
    public receive(

        senderId: PeerId,

        rawMessage: string

    ): {

        message: Message;

        plaintext: string;

    } {

        const message =

            MessageSerializer.deserialize(

                rawMessage

            );
    if (!message) {
    throw new Error("Invalid message.");
}

        if (

            !message
                .getMetadata()
                .getSenderId()
                .equals(senderId)

        ) {

            throw new Error(

                "Sender identity mismatch."

            );

        }

        const plaintext =

            this.encryptionManager.decrypt(

                senderId,

                message.getPayload()

            );

        return {

            message,

            plaintext

        };

    }

}