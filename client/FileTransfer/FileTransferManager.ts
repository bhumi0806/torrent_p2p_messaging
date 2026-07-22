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

                this.fileAssembler

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