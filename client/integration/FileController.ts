import { PeerId } from "../identity/valueObjects/PeerID";

import { FileTransferManager } from "../FileTransfer/FileTransferManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class FileController {

    constructor(

        private readonly fileTransferManager: FileTransferManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Send a file.
     */
    public async sendFile(

        receiverId: PeerId,

        fileName: string,

        mimeType: string,

        fileBytes: Uint8Array

    ): Promise<void> {

        const connection =

            this.context.getConnection(
                receiverId
            );

        if (!connection) {

            throw new Error(
                "Peer is not connected."
            );

        }

        await this.fileTransferManager.sendFile(

            connection,

            receiverId,

            fileName,

            mimeType,

            fileBytes,

            (progress: number) => {

                this.eventBus.emit(

                    "FILE_UPLOAD_PROGRESS",

                    {

                        receiverId,

                        progress

                    }

                );

            }

        );

        this.eventBus.emit(

            "FILE_SENT",

            receiverId

        );

    }

    /**
     * Receive file metadata.
     */
    public receiveMetadata(

        metadata: string

    ): void {

        this.fileTransferManager.receiveMetadata(

            metadata

        );

    }

    /**
     * Receive file chunk.
     */
    public async receiveChunk(

        senderId: PeerId,

        chunk: string

    ): Promise<void> {

        await this.fileTransferManager.receiveChunk(

            senderId,

            chunk

        );

    }

    /**
     * Cancel transfer.
     */
    public cancelTransfer(

        fileId: string

    ): void {

        this.fileTransferManager.cancelTransfer(

            fileId

        );

        this.eventBus.emit(

            "FILE_TRANSFER_CANCELLED",

            fileId

        );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "SEND_FILE",

            async (payload: {

                receiverId: PeerId;

                fileName: string;

                mimeType: string;

                fileBytes: Uint8Array;

            }) => {

                await this.sendFile(

                    payload.receiverId,

                    payload.fileName,

                    payload.mimeType,

                    payload.fileBytes

                );

            }

        );

        this.eventBus.on(

            "FILE_METADATA",

            (metadata: string) => {

                this.receiveMetadata(

                    metadata

                );

            }

        );

        this.eventBus.on(

            "FILE_CHUNK",

            async (payload: {

                senderId: PeerId;

                chunk: string;

            }) => {

                await this.receiveChunk(

                    payload.senderId,

                    payload.chunk

                );

            }

        );

        this.eventBus.on(

            "CANCEL_FILE_TRANSFER",

            (fileId: string) => {

                this.cancelTransfer(

                    fileId

                );

            }

        );

    }

}