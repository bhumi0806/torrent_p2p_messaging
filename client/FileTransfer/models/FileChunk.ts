import { EncryptedMessage } from "../../encryption/models/EncryptedMessage";

export class FileChunk {

    constructor(

        private readonly fileId: string,

        private readonly chunkIndex: number,

        private readonly totalChunks: number,

        private readonly encryptedChunk: EncryptedMessage,

        private readonly chunkHash: string

    ) {}

    /**
     * Get file ID.
     */
    public getFileId(): string {

        return this.fileId;

    }

    /**
     * Get chunk index.
     */
    public getChunkIndex(): number {

        return this.chunkIndex;

    }

    /**
     * Get total chunks.
     */
    public getTotalChunks(): number {

        return this.totalChunks;

    }

    /**
     * Get encrypted chunk.
     */
    public getEncryptedChunk(): EncryptedMessage {

        return this.encryptedChunk;

    }

    /**
     * Get SHA-256 hash.
     */
    public getChunkHash(): string {

        return this.chunkHash;

    }

    /**
     * Verify chunk index.
     */
    public isValidIndex(): boolean {

        return (

            this.chunkIndex >= 0 &&

            this.chunkIndex < this.totalChunks

        );

    }

}