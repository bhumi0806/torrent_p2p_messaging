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

    /**
     * Evaluates which peer ID is mathematically closest to the target content key
     */
    public static findClosestPeer(contentKey: string, connectedPeers: string[]): string | null {
        if (!connectedPeers || connectedPeers.length === 0) return null;

        let closest = connectedPeers[0];
        let minDistance = this.calculateDistance(contentKey, closest);

        for (let i = 1; i < connectedPeers.length; i++) {
            const distance = this.calculateDistance(contentKey, connectedPeers[i]);
            if (distance < minDistance) {
                minDistance = distance;
                closest = connectedPeers[i];
            }
        }
        return closest;
    }

    /**
     * Computes absolute mathematical difference between two hex strings
     */
    private static calculateDistance(keyA: string, keyB: string): bigint {
        try {
            // Check absolute distance difference between the first 12 characters of hex hashes
            const valA = BigInt("0x" + keyA.substring(0, 12));
            const valB = BigInt("0x" + keyB.substring(0, 12));
            return valA > valB ? valA - valB : valB - valA;
        } catch {
            return BigInt(0);
        }
    }
}
