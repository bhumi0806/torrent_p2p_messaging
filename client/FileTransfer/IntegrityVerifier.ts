import sodium from "libsodium-wrappers";

export class IntegrityVerifier {

    /**
     * Compute SHA-256 hash.
     */
    public async computeSHA256(
        data: Uint8Array
    ): Promise<string> {

        const bytes = data instanceof Uint8Array
            ? data
            : new Uint8Array(data);

        await sodium.ready;

        const hash =
            sodium.crypto_generichash(
                32,
                bytes,
                null,
                "uint8array"
            );

        return Array.from(hash)

            .map(value =>
                value
                    .toString(16)
                    .padStart(2, "0")
            )

            .join("");

    }

    /**
     * Verify a file hash.
     */
    public async verifyFile(

        file: Uint8Array,

        expectedHash: string

    ): Promise<boolean> {

        const actualHash =

            await this.computeSHA256(
                file
            );

        return actualHash === expectedHash;

    }

    /**
     * Verify a chunk hash.
     */
    public async verifyChunk(

        chunk: Uint8Array,

        expectedHash: string

    ): Promise<boolean> {

        const actualHash =

            await this.computeSHA256(
                chunk
            );

        return actualHash === expectedHash;

    }

}
