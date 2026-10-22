import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { ChunkManager } from "./ChunkManager";
import { IntegrityVerifier } from "./IntegrityVerifier";
import { FileAssembler } from "./FileAssembler";

import { FileSender } from "./FileSender";
import { FileReceiver } from "./FileReceiver";

import { FileTransfer } from "./models/FileTransfer";
import { ApplicationContext } from "../integration/ApplicationContext";
import { FileMetadata } from "./models/FileMetadata";

// Bring in our standalone routing metrics safely
import { FreenetEngine } from "../utils/FreenetEngine";

export class FileTransferManager {

    private readonly chunkManager =
        new ChunkManager();

    private readonly integrityVerifier =
        new IntegrityVerifier();

    private readonly fileAssembler: FileAssembler;

    private readonly sender: FileSender;

    private readonly receiver: FileReceiver;

    constructor(

        encryptionManager: EncryptionManager,

        webRTCManager: WebRTCManager,

        context: ApplicationContext,

        onFileReceived?: (
            metadata: FileMetadata,
            file: Uint8Array
        ) => void

    ) {

        this.fileAssembler =

            new FileAssembler(

                encryptionManager,

                this.integrityVerifier

            );

        this.sender =

            new FileSender(

                encryptionManager,

                webRTCManager,

                this.chunkManager,

                this.integrityVerifier,

                context

            );

        this.receiver =

            new FileReceiver(

                encryptionManager,

                this.chunkManager,

                this.integrityVerifier,

                this.fileAssembler,

                onFileReceived

            );

    }

    /**
     * Send a file.
     */
    public async sendFile(

        connection: PeerConnection,

        receiverId: PeerId,

        fileName: string,

        mimeType: string,

        fileBytes: Uint8Array,

        onProgress?: (progress: number) => void

    ): Promise<void> {

        // Freenet Diagnostic: Log that a new chunk series deployment is starting
        console.log(`[FREENET DATA]: Segmenting data stream for routing: ${fileName}`);

        await this.sender.send(

            connection,

            receiverId,

            fileName,

            mimeType,

            fileBytes,

            onProgress

        );

    }

    /**
     * Receive file metadata.
     */
    public receiveMetadata(

        rawMetadata: string

    ): void {

        this.receiver.receiveMetadata(

            rawMetadata

        );

    }

    /**
     * Receive file chunk.
     */
    public async receiveChunk(

        senderId: PeerId,

        rawChunk: string

    ): Promise<void> {

        // --- FREENET LAYER INTERCEPTION START ---
        try {
            // Natively generate a hash identifier for the transit text chunk
            const chunkHash = await FreenetEngine.generateContentKey(rawChunk);
            
            // Freenet Dynamic Caching rule: Commit the individual chunk frame to the browser's storage
            // This allows the node to act as a fractional mirror host for this piece of the file
            localStorage.setItem(`freenet_chunk_${chunkHash.substring(0, 16)}`, rawChunk);
            
            console.log(`[CACHE SUCCESS]: Transit file chunk committed for hash space: ${chunkHash.substring(0, 8)}`);
        } catch (e) {
            console.error("FileTransferManager: Failed to calculate/cache transit chunk:", e);
        }
        // --- FREENET LAYER INTERCEPTION END ---

        await this.receiver.receiveChunk(

            senderId,

            rawChunk

        );

    }

    /**
     * Cancel transfer.
     */
    public cancelTransfer(

        fileId: string

    ): void {

        this.receiver.cancelTransfer(

            fileId

        );

        this.sender.cancel();

    }

    /**
     * Check active transfer.
     */
    public hasTransfer(

        fileId: string

    ): boolean {

        return this.receiver.hasTransfer(

            fileId

        );

    }

    /**
     * Get active transfer.
     */
    public getTransfer(

        fileId: string

    ): FileTransfer | undefined {

        return this.receiver.getTransfer(

            fileId

        );

    }

}
