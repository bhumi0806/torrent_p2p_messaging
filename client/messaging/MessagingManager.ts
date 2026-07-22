import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { Message } from "./models/Message";

import { MessageSender } from "./MessageSender";
import { MessageReceiver } from "./MessageReceiver";
import { ApplicationContext } from "../integration/ApplicationContext";

export class MessagingManager {

    private readonly sender: MessageSender;

    private readonly receiver: MessageReceiver;

    constructor(

        encryptionManager: EncryptionManager,

        webRTCManager: WebRTCManager,

        context:ApplicationContext

    ) {

        this.sender =

            new MessageSender(

                encryptionManager,

                webRTCManager,

                context

            );

        this.receiver =

            new MessageReceiver(encryptionManager);

    }

    /**
     * Send message.
     */
    public send(

        connection: PeerConnection,

        receiverId: PeerId,

        plaintext: string

    ): void {

        this.sender.send(

            connection,

            receiverId,

            plaintext

        );

    }

    /**
     * Receive message.
     */
    public receive(

        senderId: PeerId,

        rawMessage: string

    ): {

        message: Message;

        plaintext: string;

    } {

        return this.receiver.receive(

            senderId,

            rawMessage

        );

    }

}