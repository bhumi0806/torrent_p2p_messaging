import { FileChunk } from "./models/FileChunk";
import { FileMetadata } from "./models/FileMetadata";

import { EncryptedMessage } from "../encryption/models/EncryptedMessage";

import { PeerId } from "../identity/valueObjects/PeerID";

import { TransferStatus } from "./types/TransferStatus";

export class FileSerializer {

    /**
     * Serialize metadata.
     */
    public static serializeMetadata(
        metadata: FileMetadata
    ): string {

        return JSON.stringify({

            fileId: metadata.getFileId(),

            senderId:
                metadata
                    .getSenderId()
                    .toString(),

            receiverId:
                metadata
                    .getReceiverId()
                    .toString(),

            fileName:
                metadata.getFileName(),

            fileSize:
                metadata.getFileSize(),

            mimeType:
                metadata.getMimeType(),

            totalChunks:
                metadata.getTotalChunks(),

            sha256:
                metadata.getSHA256(),

            transferStatus:
                metadata
                    .getTransferStatus()

        });

    }

    /**
     * Serialize chunk.
     */
    public static serializeChunk(
        chunk: FileChunk
    ): string {

        return JSON.stringify({

            fileId:
                chunk.getFileId(),

            chunkIndex:
                chunk.getChunkIndex(),

            totalChunks:
                chunk.getTotalChunks(),

            encryptedChunk:
                chunk
                    .getEncryptedChunk()
                    .toJSON(),

            chunkHash:
                chunk.getChunkHash()

        });

    }

    /**
     * Deserialize metadata.
     */
    public static deserializeMetadata(
        json: string
    ): FileMetadata {

        const object = JSON.parse(json);

        return new FileMetadata(

            object.fileId,

            PeerId.fromString(
                object.senderId
            ),

            PeerId.fromString(
                object.receiverId
            ),

            object.fileName,

            object.fileSize,

            object.mimeType,

            object.totalChunks,

            object.sha256,

            object.transferStatus as TransferStatus

        );

    }

    /**
     * Deserialize chunk.
     */
    public static deserializeChunk(
        json: string
    ): FileChunk {

        const object = JSON.parse(json);

        return new FileChunk(

            object.fileId,

            object.chunkIndex,

            object.totalChunks,

            EncryptedMessage.fromJSON(
                object.encryptedChunk
            ),

            object.chunkHash

        );

    }

}