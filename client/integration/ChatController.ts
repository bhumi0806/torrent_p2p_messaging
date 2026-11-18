import { PeerId } from "../identity/valueObjects/PeerID";

import { MessagingManager } from "../messaging/MessagingManager";

import { Message } from "../messaging/models/Message";
import { MessageSerializer } from "../messaging/MessageSerializer";
import { DeliveryStatus } from "../messaging/types/DeliveryStatus";
import { RouteMessageResponse } from "../messaging/RouteMessageProtocol";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

// Import our standalone routing utility securely
import { FreenetEngine } from "../utils/FreenetEngine";

export class ChatController {

    constructor(

        private readonly messagingManager: MessagingManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext,

        private readonly sendRoutedMessage: (
            destinationPeerId: string,
            messageId: string,
            encryptedPayload: string,
            onProgress?: (response: RouteMessageResponse) => void,
            originHopLimit?: number
        ) => Promise<RouteMessageResponse>

    ) {}

    /**
     * Send a chat message.
     */
    public async sendMessage(

        receiverId: PeerId | string,

        content: string,

        originHopLimit?: number

    ): Promise<void> {
        const remotePeerId = this.toPeerId(receiverId);

        if (

            content.trim().length === 0

        ) {

            throw new Error(

                "Message cannot be empty."

            );

        }

        const remotePeer = this.context.getOnlinePeers().find(
            (peer: any) => peer?.peerId === remotePeerId.toString()
        );
        if (typeof remotePeer?.publicKey !== "string") {
            throw new Error("Recipient identity record is unavailable.");
        }

        await this.messagingManager.ensureSessionKey(remotePeerId, remotePeer.publicKey);
        const message = this.messagingManager.createOutboundMessage(remotePeerId, content);
        const messageId = message.getMetadata().getMessageId();
        const encryptedPayload = MessageSerializer.serialize(message);
        this.context.addMessage(remotePeerId, message);
        await this.eventBus.emit("MESSAGE_SEND_PENDING", {
            messageId,
            receiverId: remotePeerId,
            content
        });

        let outcome: RouteMessageResponse | undefined;
        try {
            outcome = await this.sendRoutedMessage(
                remotePeerId.toString(),
                messageId,
                encryptedPayload,
                progress => {
                    if (progress.status === "relay_received" || progress.status === "relay_forwarded") {
                        message.getMetadata().setDeliveryStatus(DeliveryStatus.SENT);
                        void this.eventBus.emit("MESSAGE_DELIVERY_PROGRESS", progress);
                    }
                },
                originHopLimit
            );
            const accepted = outcome.status === "delivered" ||
                (outcome.status === "duplicate" && outcome.responderPeerId === remotePeerId.toString());
            message.getMetadata().setDeliveryStatus(accepted ? DeliveryStatus.DELIVERED : DeliveryStatus.FAILED);
            await this.eventBus.emit("MESSAGE_DELIVERY_STATUS", {
                messageId,
                receiverId: remotePeerId,
                status: outcome.status,
                reason: outcome.reason
            });
            if (!accepted) throw new Error(`Message ${outcome.status}: ${outcome.reason}`);
        } catch (error) {
            if (!outcome) {
                message.getMetadata().setDeliveryStatus(DeliveryStatus.FAILED);
                await this.eventBus.emit("MESSAGE_DELIVERY_STATUS", {
                    messageId,
                    receiverId: remotePeerId,
                    status: "unreachable",
                    reason: error instanceof Error ? error.message : String(error)
                });
            }
            throw error;
        }

    }

    /**
     * Receive a chat message.
     */
    public async receiveMessage(

        senderId: PeerId | string,

        encryptedMessage: string,

        transportPeerId: PeerId | string = senderId

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
                senderId: remotePeerId,
                transportPeerId: typeof transportPeerId === "string"
                    ? PeerId.fromString(transportPeerId)
                    : transportPeerId
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

                transportPeerId?: PeerId | string;

            }) => {

                await this.receiveMessage(

                    payload.senderId,

                    payload.encryptedMessage,

                    payload.transportPeerId ?? payload.senderId

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
