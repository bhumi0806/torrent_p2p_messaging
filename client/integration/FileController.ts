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

        receiverId: PeerId | string,

        fileName: string,

        mimeType: string,

        fileBytes: Uint8Array

    ): Promise<void> {
        const remotePeerId = this.toPeerId(receiverId);

        const connection =

            this.context.getConnection(
                remotePeerId
            );

        if (!connection) {

            throw new Error(
                "Peer is not connected."
            );

        }

        // Freenet Logging Tracker for local terminal debugging
        console.log(`[FREENET OUTBOUND]: Initiating secure file distribution channel for payload: ${fileName}`);

        await this.fileTransferManager.sendFile(

            connection,

            remotePeerId,

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

        senderId: PeerId | string,

        chunk: string

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);

        await this.fileTransferManager.receiveChunk(

            remotePeerId,

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

                receiverId: PeerId | string;

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

                senderId: PeerId | string;

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

    private toPeerId(peerId: PeerId | string): PeerId {

        return typeof peerId === "string"
            ? PeerId.fromString(peerId)
            : peerId;

    }

}
