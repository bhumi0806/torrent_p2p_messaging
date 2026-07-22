import { FileMetadata } from "./FileMetadata";
import { FileChunk } from "./FileChunk";

export class FileTransfer {

    private readonly chunks =
        new Map<number, FileChunk>();

    constructor(

        private readonly metadata: FileMetadata

    ) {}

    /**
     * Get metadata.
     */
    public getMetadata(): FileMetadata {

        return this.metadata;

    }

    /**
     * Add a chunk.
     */
    public addChunk(
        chunk: FileChunk
    ): boolean {

        if (

            !chunk.isValidIndex()

        ) {

            return false;

        }

        if (

            this.chunks.has(

                chunk.getChunkIndex()

            )

        ) {

            return false;

        }

        this.chunks.set(

            chunk.getChunkIndex(),

            chunk

        );

        return true;

    }

    /**
     * Get a chunk.
     */
    public getChunk(
        index: number
    ): FileChunk | undefined {

        return this.chunks.get(index);

    }

    /**
     * Get all chunks.
     */
    public getChunks(): FileChunk[] {

        return Array.from(

            this.chunks.values()

        ).sort(

            (a, b) =>

                a.getChunkIndex()

                -

                b.getChunkIndex()

        );

    }

    /**
     * Check if transfer is complete.
     */
    public isComplete(): boolean {

        return (

            this.chunks.size ===

            this.metadata.getTotalChunks()

        );

    }

    /**
     * Get received chunk count.
     */
    public getReceivedChunkCount(): number {

        return this.chunks.size;

    }

    /**
     * Get missing chunk indices.
     */
    public getMissingChunks(): number[] {

        const missing: number[] = [];

        for (

            let i = 0;

            i < this.metadata.getTotalChunks();

            i++

        ) {

            if (

                !this.chunks.has(i)

            ) {

                missing.push(i);

            }

        }

        return missing;

    }

    /**
     * Remove all chunks.
     */
    public clear(): void {

        this.chunks.clear();

    }

}