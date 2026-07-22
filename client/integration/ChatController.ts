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

        receiverId: PeerId,

        content: string

    ): Promise<void> {

        if (

            content.trim().length === 0

        ) {

            throw new Error(

                "Message cannot be empty."

            );

        }

        const connection =

            this.context.getConnection(

                receiverId

            );

        if (!connection) {

            throw new Error(

                "Peer is not connected."

            );

        }

        await this.messagingManager.send(

            connection,

            receiverId,

            content

        );

    }

    /**
     * Receive a chat message.
     */
    public async receiveMessage(

        senderId: PeerId,

        encryptedMessage: string

    ): Promise<void> {

        const { message } =

            await this.messagingManager.receive(

                senderId,

                encryptedMessage

            );

        this.context.addMessage(

            senderId,

            message

        );

        this.eventBus.emit(

            "MESSAGE_RECEIVED",

            message

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

        peerId: PeerId

    ): void {

        this.context.clearMessages(

            peerId

        );

        this.eventBus.emit(

            "CHAT_CLEARED",

            peerId

        );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "SEND_MESSAGE",

            async (payload: {

                receiverId: PeerId;

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

                senderId: PeerId;

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

}