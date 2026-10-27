/** Bounded, in-memory cache for encrypted chunks passing through this client. */
export class PassiveChunkCache {
    public static readonly shared = new PassiveChunkCache();

    private readonly entries = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
    private readonly maxEntries: number;
    private readonly maxBytes: number;
    private readonly ttlMs: number;
    private readonly cleanupTimer: ReturnType<typeof setInterval>;

    constructor(options: { maxEntries?: number; maxBytes?: number; ttlMs?: number } = {}) {
        this.maxEntries = options.maxEntries ?? 256;
        this.maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
        this.ttlMs = options.ttlMs ?? 2 * 60 * 1000;
        this.cleanupTimer = setInterval(() => this.prune(), Math.min(this.ttlMs, 30_000));
        (this.cleanupTimer as unknown as { unref?: () => void }).unref?.();
    }

    /** Cache an opaque encrypted chunk and return its content-addressed cache key. */
    public async cacheChunk(chunk: Uint8Array | string): Promise<string> {
        const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        if (bytes.byteLength > this.maxBytes) throw new Error("Encrypted chunk exceeds passive cache limit.");
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer));
        const key = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");

        this.prune();
        this.entries.delete(key);
        this.entries.set(key, { bytes, expiresAt: Date.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries || this.totalBytes() > this.maxBytes) {
            const oldest = this.entries.keys().next().value as string | undefined;
            if (!oldest) break;
            this.entries.delete(oldest);
        }
        return key;
    }

    public getChunk(key: string): Uint8Array | undefined {
        this.prune();
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        // Refresh insertion order for simple LRU eviction, without extending TTL.
        this.entries.delete(key);
        this.entries.set(key, entry);
        return new Uint8Array(entry.bytes);
    }

    public get size(): number {
        this.prune();
        return this.entries.size;
    }

    public clear(): void {
        this.entries.clear();
    }

    public dispose(): void {
        clearInterval(this.cleanupTimer);
        this.clear();
    }

    private prune(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }

    private totalBytes(): number {
        let total = 0;
        for (const entry of this.entries.values()) total += entry.bytes.byteLength;
        return total;
    }
}
