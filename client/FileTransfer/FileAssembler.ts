import { EncryptionManager } from "../encryption/EncryptionManager";

import { FileTransfer } from "./models/FileTransfer";
import { IntegrityVerifier } from "./IntegrityVerifier";

export class FileAssembler {

    constructor(

        private readonly encryptionManager: EncryptionManager,

        private readonly integrityVerifier: IntegrityVerifier

    ) {}

    /**
     * Assemble a complete file.
     */
    public async assemble(

        transfer: FileTransfer

    ): Promise<Uint8Array> {

        if (

            !transfer.isComplete()

        ) {

            throw new Error(

                "File transfer is incomplete."

            );

        }

        const metadata =

            transfer.getMetadata();

        const chunks =

            transfer.getChunks();

        const decryptedChunks:
            Uint8Array[] = [];

        for (const chunk of chunks) {

            const bytes =

                this.encryptionManager.decryptBytes(

                    metadata.getSenderId(),

                    chunk.getEncryptedChunk()

                );

            const valid =

                await this.integrityVerifier
                    .verifyChunk(

                        bytes,

                        chunk.getChunkHash()

                    );

            if (!valid) {

                throw new Error(

                    `Chunk ${chunk.getChunkIndex()} failed integrity verification.`

                );

            }

            decryptedChunks.push(

                bytes

            );

        }

        const totalLength =

            decryptedChunks.reduce(

                (sum, chunk) =>

                    sum + chunk.length,

                0

            );

        const file =

            new Uint8Array(totalLength);

        let offset = 0;

        for (const chunk of decryptedChunks) {

            file.set(

                chunk,

                offset

            );

            offset += chunk.length;

        }

        const verified =

            await this.integrityVerifier
                .verifyFile(

                    file,

                    metadata.getSHA256()

                );

        if (!verified) {

            throw new Error(

                "Final file integrity verification failed."

            );

        }

        return file;

    }

}
