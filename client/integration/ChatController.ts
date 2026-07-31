import { PeerId } from "../identity/valueObjects/PeerID";

import { MessagingManager } from "../messaging/MessagingManager";

import { Message } from "../messaging/models/Message";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class ChatController {

    constructor(

        private readonly messagingManager: MessagingManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Send a chat message.
     */
    public async sendMessage(

        receiverId: PeerId | string,

        content: string

    ): Promise<void> {
        const remotePeerId = this.toPeerId(receiverId);

        if (

            content.trim().length === 0

        ) {

            throw new Error(

                "Message cannot be empty."

            );

        }

        const connection =

            this.context.getConnection(

                remotePeerId

            );

        if (!connection) {

            throw new Error(

                "Peer is not connected."

            );

        }

        await this.messagingManager.send(

            connection,

            remotePeerId,

            content

        );

    }

    /**
     * Receive a chat message.
     */
    public async receiveMessage(

        senderId: PeerId | string,

        encryptedMessage: string

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);

        const result =

            await this.messagingManager.receive(

                remotePeerId,

                encryptedMessage

            );

        const { message, plaintext } = result;

        this.context.addMessage(

            remotePeerId,

            message

        );

        this.eventBus.emit(

            "MESSAGE_RECEIVED",

            {
                message,
                plaintext,
                senderId: remotePeerId
            }

        );

    }

    /**
     * Get chat history.
     */
    public getMessages(

        peerId: PeerId

    ): Message[] {

        return this.context.getMessages(

            peerId

        );

    }

    /**
     * Clear chat history.
     */
    public clearMessages(

        peerId: PeerId | string

    ): void {

        this.context.clearMessages(

            this.toPeerId(peerId)

        );

        this.eventBus.emit(

            "CHAT_CLEARED",

            this.toPeerId(peerId)

        );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "SEND_MESSAGE",

            async (payload: {

                receiverId: PeerId | string;

                content: string;

            }) => {

                await this.sendMessage(

                    payload.receiverId,

                    payload.content

                );

            }

        );

        this.eventBus.on(

            "RECEIVE_MESSAGE",

            async (payload: {

                senderId: PeerId | string;

                encryptedMessage: string;

            }) => {

                await this.receiveMessage(

                    payload.senderId,

                    payload.encryptedMessage

                );

            }

        );

        this.eventBus.on(

            "CLEAR_CHAT",

            (peerId: PeerId) => {

                this.clearMessages(

                    peerId

                );

            }

        );

    }

    private toPeerId(peerId: PeerId | string): PeerId {

        return typeof peerId === "string"
            ? PeerId.fromString(peerId)
            : peerId;

    }

}
