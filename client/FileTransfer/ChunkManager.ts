import { FileChunk } from "./models/FileChunk";
import { EncryptedMessage } from "../encryption/models/EncryptedMessage";

export class ChunkManager {

    public static readonly DEFAULT_CHUNK_SIZE =
        64 * 1024; // 64 KB

    public static readonly MAX_CHUNK_SIZE =
        256 * 1024; // 256 KB

    /**
     * Split file into chunks.
     */
    public split(
        file: Uint8Array,
        chunkSize: number = ChunkManager.DEFAULT_CHUNK_SIZE
    ): Uint8Array[] {

        if (
            chunkSize <= 0 ||
            chunkSize > ChunkManager.MAX_CHUNK_SIZE
        ) {

            throw new Error(
                "Invalid chunk size."
            );

        }

        const chunks: Uint8Array[] = [];

        for (
            let offset = 0;
            offset < file.length;
            offset += chunkSize
        ) {

            chunks.push(

                file.slice(

                    offset,

                    Math.min(
                        offset + chunkSize,
                        file.length
                    )

                )

            );

        }

        return chunks;

    }

    /**
     * Validate chunk.
     */
    public validateChunk(
        chunk: FileChunk
    ): boolean {

        return (

            chunk.isValidIndex() &&

            chunk
                .getEncryptedChunk()
                instanceof EncryptedMessage

        );

    }

    /**
     * Reassemble raw bytes.
     */
    public assembleBytes(
        chunks: Uint8Array[]
    ): Uint8Array {

        let totalLength = 0;

        for (const chunk of chunks) {

            totalLength += chunk.length;

        }

        const file =
            new Uint8Array(totalLength);

        let offset = 0;

        for (const chunk of chunks) {

            file.set(chunk, offset);

            offset += chunk.length;

        }

        return file;

    }

}