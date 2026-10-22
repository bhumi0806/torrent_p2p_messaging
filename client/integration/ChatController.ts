import { PeerId } from "../identity/valueObjects/PeerID";

import { MessagingManager } from "../messaging/MessagingManager";

import { Message } from "../messaging/models/Message";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

// Import our standalone routing utility securely
import { FreenetEngine } from "../utils/FreenetEngine";

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

        // Freenet Integration: The content string arriving here from App.ts 
        // is already wrapped into a stringified Freenet envelope object.
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

        let { message, plaintext } = result;

        // --- FREENET LAYER INTERCEPTION START ---
        try {
            // 1. Check if the decrypted text content is a routed Freenet network envelope
            const parsedEnvelope = JSON.parse(plaintext);
            
            if (parsedEnvelope && parsedEnvelope.freenetKey && parsedEnvelope.actualData) {
                const { freenetKey, actualData } = parsedEnvelope;
                
                console.log(`[FREENET ENGINE]: Intercepted packet hash [${freenetKey.substring(0, 8)}] from peer ${remotePeerId.toString()}`);

                // 2. Dynamic Caching Rule: Commit the transit frame directly into browser store
                localStorage.setItem(`freenet_cache_${freenetKey}`, actualData);
                console.log(`[CACHE SUCCESS]: Transit data committed for key space: ${freenetKey.substring(0, 12)}...`);

                // 3. Override the structural plaintext stream so the core app UI shows the text inside the chat block cleanly
                plaintext = actualData;
            }
        } catch {
            // Fallback: If JSON parsing throws an exception, it is a normal string message. Let it flow down normally.
            console.log("ChatController: Non-JSON plain data received. Skipping Freenet cache pipelines.");
        }
        // --- FREENET LAYER INTERCEPTION END ---

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
