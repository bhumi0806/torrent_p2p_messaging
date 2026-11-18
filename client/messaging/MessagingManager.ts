import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { Message } from "./models/Message";

import { MessageSender } from "./MessageSender";
import { MessageReceiver } from "./MessageReceiver";
import { ChatThreadEngine, ChatThreadMember } from "./ChatThreadEngine";
import { ApplicationContext } from "../integration/ApplicationContext";
import { PublicKey } from "../identity/valueObjects/PublicKey";

export class MessagingManager {

    private readonly threads = new Map<string, ChatThreadEngine>();

    private readonly sender: MessageSender;

    private readonly receiver: MessageReceiver;

    constructor(

        private readonly encryptionManager: EncryptionManager,

        webRTCManager: WebRTCManager,

        private readonly context: ApplicationContext

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
    public async send(

        connection: PeerConnection,

        receiverId: PeerId,

        plaintext: string

    ): Promise<void> {

        await this.sender.send(

            connection,

            receiverId,

            plaintext

        );

    }

    /** Derive the existing end-to-end pairwise key from a verified remote identity record. */
    public async ensureSessionKey(peerId: PeerId, encodedPublicKey: string): Promise<void> {
        if (this.encryptionManager.hasSessionKey(peerId)) return;
        const identity = this.context.getIdentity();
        if (!identity) throw new Error("Local identity is not initialized.");
        const publicKey = PublicKey.fromBase64(encodedPublicKey);
        const derivedPeerId = await PeerId.fromPublicKey(publicKey.bytes);
        if (!derivedPeerId.equals(peerId)) throw new Error("Remote public key does not match peer ID.");
        await this.encryptionManager.deriveAndStoreSessionKey(
            identity.getPrivateIdentity(),
            peerId,
            publicKey
        );
    }

    public createOutboundMessage(receiverId: PeerId, plaintext: string): Message {
        return this.sender.createMessage(receiverId, plaintext);
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

    /** Create or retrieve the state engine for a group room. */
    public createThread(roomId: string, members: readonly ChatThreadMember[] = []): ChatThreadEngine {
        const existing = this.threads.get(roomId);
        if (existing) {
            for (const member of members) existing.addMember(member.senderId, member.publicKey);
            return existing;
        }
        const thread = new ChatThreadEngine(roomId, members);
        this.threads.set(roomId, thread);
        return thread;
    }

    public getThread(roomId: string): ChatThreadEngine | undefined {
        return this.threads.get(roomId);
    }

    public receiveThreadPacket(roomId: string, packet: unknown): Promise<boolean> {
        const thread = this.threads.get(roomId);
        if (!thread) throw new Error("Chat room thread has not been initialized.");
        return thread.ingest(packet);
    }

    public removeThread(roomId: string): void {
        const thread = this.threads.get(roomId);
        thread?.clear();
        this.threads.delete(roomId);
    }

}
