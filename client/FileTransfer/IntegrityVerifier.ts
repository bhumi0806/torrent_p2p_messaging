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

        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

        const hashBuffer =
            await crypto.subtle.digest(
                "SHA-256",
                buffer
            );

        const hash =
            new Uint8Array(hashBuffer);

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