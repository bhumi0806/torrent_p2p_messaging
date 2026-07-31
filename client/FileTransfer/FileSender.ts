

import { ApplicationContext } from "../integration/ApplicationContext";
import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

import { ChunkManager } from "./ChunkManager";
import { IntegrityVerifier } from "./IntegrityVerifier";
import { FileSerializer } from "./FileSerializer";

import { FileChunk } from "./models/FileChunk";
import { FileMetadata } from "./models/FileMetadata";
import { createRandomId } from "../utils/createRandomId";

import { TransferStatus } from "./types/TransferStatus";


export class FileSender {

    public static readonly MAX_FILE_SIZE =
        100 * 1024 * 1024; // 100 MB

    private cancelled = false;

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly webRTCManager: WebRTCManager,

        private readonly chunkManager: ChunkManager,

        private readonly integrityVerifier: IntegrityVerifier,

        private readonly context: ApplicationContext,

    ) {}

    /**
     * Send file.
     */
    public async send(

        connection: PeerConnection,

        receiverId: PeerId,

        fileName: string,

        mimeType: string,

        fileBytes: Uint8Array,

        onProgress?: (progress: number) => void

    ): Promise<void> {

        this.cancelled = false;

        if (

            fileBytes.length === 0

        ) {

            throw new Error(

                "File is empty."

            );

        }

        if (

            fileBytes.length >

            FileSender.MAX_FILE_SIZE

        ) {

            throw new Error(

                "File exceeds maximum allowed size."

            );

        }

        const chunks =

            this.chunkManager.split(

                fileBytes

            );

        const fileHash =

            await this.integrityVerifier.computeSHA256(fileBytes);
            const identity = this.context.getIdentity();

if (!identity) {
    throw new Error("Identity not initialized.");
}

        const metadata =

            new FileMetadata(

                createRandomId(),

                 identity.getPeerId(),

                receiverId,

                fileName,

                fileBytes.length,

                mimeType,

                chunks.length,

                fileHash,

                TransferStatus.PENDING

            );

        const dataChannel =

            this.context.getDataChannel(

                receiverId

            );

        if (!dataChannel) {
            throw new Error(
                "Chat DataChannel is not available yet."
            );
        }

        await dataChannel.waitUntilOpen();

        dataChannel.send(
            JSON.stringify({
                kind: "file-metadata",
                payload: FileSerializer.serializeMetadata(
                    metadata
                )
            })
        );

        metadata.setTransferStatus(

            TransferStatus.TRANSFERRING

        );

        for (

            let index = 0;

            index < chunks.length;

            index++

        ) {

            if (

                this.cancelled

            ) {

                metadata.setTransferStatus(

                    TransferStatus.CANCELLED

                );

                return;

            }

            const chunkBytes =

                chunks[index];

            const encryptedChunk =

                this.encryptionManager.encryptBytes(

                    receiverId,

                    chunkBytes

                );

            const chunkHash =

                await this.integrityVerifier.computeSHA256(

                    chunkBytes

                );

            const chunk =

                new FileChunk(

                    metadata.getFileId(),

                    index,

                    chunks.length,

                    encryptedChunk,

                    chunkHash

                );

            dataChannel.send(
                JSON.stringify({
                    kind: "file-chunk",
                    payload: FileSerializer.serializeChunk(
                        chunk
                    )
                })
            );

            if (

                onProgress

            ) {

                onProgress(

                    Math.floor(

                        ((index + 1) /

                            chunks.length) *

                        100

                    )

                );

            }

        }

        metadata.setTransferStatus(

            TransferStatus.COMPLETED

        );

    }

    /**
     * Cancel transfer.
     */
    public cancel(): void {

        this.cancelled = true;

    }

}
