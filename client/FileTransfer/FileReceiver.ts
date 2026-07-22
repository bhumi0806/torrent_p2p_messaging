import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { ChunkManager } from "./ChunkManager";
import { FileAssembler } from "./FileAssembler";
import { IntegrityVerifier } from "./IntegrityVerifier";
import { FileSerializer } from "./FileSerializer";

import { FileChunk } from "./models/FileChunk";
import { FileMetadata } from "./models/FileMetadata";
import { FileTransfer } from "./models/FileTransfer";

import { TransferStatus } from "./types/TransferStatus";

export class FileReceiver {

    private readonly activeTransfers =
        new Map<string, FileTransfer>();

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly chunkManager: ChunkManager,

        private readonly integrityVerifier: IntegrityVerifier,

        private readonly fileAssembler: FileAssembler

    ) {}

    /**
     * Receive file metadata.
     */
    public receiveMetadata(
        rawMetadata: string
    ): void {

        const metadata =

            FileSerializer.deserializeMetadata(
                rawMetadata
            );

        if (

            this.activeTransfers.has(
                metadata.getFileId()
            )

        ) {

            throw new Error(
                "Duplicate file transfer."
            );

        }

        metadata.setTransferStatus(
            TransferStatus.TRANSFERRING
        );

        this.activeTransfers.set(

            metadata.getFileId(),

            new FileTransfer(
                metadata
            )

        );

    }

    /**
     * Receive a file chunk.
     */
    public async receiveChunk(

        senderId: PeerId,

        rawChunk: string

    ): Promise<void> {

        const chunk =

            FileSerializer.deserializeChunk(
                rawChunk
            );

        const transfer =

            this.activeTransfers.get(
                chunk.getFileId()
            );

        if (!transfer) {

            throw new Error(
                "Unknown file transfer."
            );

        }

        const metadata =
            transfer.getMetadata();

        if (

            !metadata
                .getSenderId()
                .equals(senderId)

        ) {

            throw new Error(
                "Sender verification failed."
            );

        }

        if (

            !this.chunkManager.validateChunk(
                chunk
            )

        ) {

            throw new Error(
                "Invalid chunk."
            );

        }

        if (

            !transfer.addChunk(
                chunk
            )

        ) {

            return;

        }

        if (

            transfer.isComplete()

        ) {

            const file =

                await this.fileAssembler.assemble(
                    transfer
                );

            metadata.setTransferStatus(
                TransferStatus.VERIFIED
            );

            this.activeTransfers.delete(
                metadata.getFileId()
            );

            this.onTransferCompleted(

                metadata,

                file

            );

        }

    }

    /**
     * Cancel transfer.
     */
    public cancelTransfer(
        fileId: string
    ): void {

        const transfer =

            this.activeTransfers.get(
                fileId
            );

        if (!transfer) {

            return;

        }

        transfer
            .getMetadata()
            .setTransferStatus(

                TransferStatus.CANCELLED

            );

        transfer.clear();

        this.activeTransfers.delete(
            fileId
        );

    }

    /**
     * Check whether transfer exists.
     */
    public hasTransfer(
        fileId: string
    ): boolean {

        return this.activeTransfers.has(
            fileId
        );

    }

    /**
     * Get active transfer.
     */
    public getTransfer(
        fileId: string
    ): FileTransfer | undefined {

        return this.activeTransfers.get(
            fileId
        );

    }

    /**
     * Called when file is fully verified.
     * Override in upper layer.
     */
    protected onTransferCompleted(

        metadata: FileMetadata,

        file: Uint8Array

    ): void {

        // Implement in UI/Application layer.

    }

}