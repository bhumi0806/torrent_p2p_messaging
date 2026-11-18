export class FreenetEngine {
    /**
     * Natively computes a SHA-256 hash string for text content
     */
    public static async generateContentKey(text: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    /** Select the peer with the smallest XOR distance from a 256-bit content key. */
    public static findClosestPeer(contentKey: string, connectedPeers: string[]): string | null {
        if (!connectedPeers || connectedPeers.length === 0) return null;

        const target = this.parseKey(contentKey);

        let closest = connectedPeers[0];
        let minDistance = target ^ this.parseKey(closest);

        for (let i = 1; i < connectedPeers.length; i++) {
            const distance = target ^ this.parseKey(connectedPeers[i]);
            if (distance < minDistance) {
                minDistance = distance;
                closest = connectedPeers[i];
            }
        }
        return closest;
    }

    /** Calculate full-width XOR distance between 256-bit hexadecimal keys. */
    public static calculateXorDistance(keyA: string, keyB: string): bigint {
        return this.parseKey(keyA) ^ this.parseKey(keyB);
    }

    private static parseKey(value: string): bigint {
        if (!/^[a-f0-9]{64}$/i.test(value)) {
            throw new Error("Freenet keys and peer IDs must be 256-bit hexadecimal strings.");
        }
        return BigInt(`0x${value}`);
    }
}
