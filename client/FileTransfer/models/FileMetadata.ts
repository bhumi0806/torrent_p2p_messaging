import { PeerId } from "../../identity/valueObjects/PeerID";

import { TransferStatus } from "../types/TransferStatus";

export class FileMetadata {

    constructor(

        private readonly fileId: string,

        private readonly senderId: PeerId,

        private readonly receiverId: PeerId,

        private readonly fileName: string,

        private readonly fileSize: number,

        private readonly mimeType: string,

        private readonly totalChunks: number,

        private readonly sha256: string,

        private transferStatus: TransferStatus

    ) {}

    public getFileId(): string {

        return this.fileId;

    }

    public getSenderId(): PeerId {

        return this.senderId;

    }

    public getReceiverId(): PeerId {

        return this.receiverId;

    }

    public getFileName(): string {

        return this.fileName;

    }

    public getFileSize(): number {

        return this.fileSize;

    }

    public getMimeType(): string {

        return this.mimeType;

    }

    public getTotalChunks(): number {

        return this.totalChunks;

    }

    public getSHA256(): string {

        return this.sha256;

    }

    public getTransferStatus(): TransferStatus {

        return this.transferStatus;

    }

    public setTransferStatus(
        status: TransferStatus
    ): void {

        this.transferStatus = status;

    }

}