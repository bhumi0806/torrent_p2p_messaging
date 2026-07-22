import { KeyPair } from "../KeyPair";
import { PublicIdentity } from "./PublicIdentity";
import { PeerId } from "../valueObjects/PeerID";

export class PrivateIdentity {

    constructor(
        private readonly keyPair: KeyPair,
        private readonly publicIdentity: PublicIdentity
    ) {}

    public getKeyPair(): KeyPair {
        return this.keyPair;
    }

    public getPublicIdentity(): PublicIdentity {
        return this.publicIdentity;
    }

    public getPeerId(): PeerId {
        return this.publicIdentity.peerId;
    }
    private bytesToBase64(bytes: Uint8Array): string {

    let binary = "";

    for (const byte of bytes) {

        binary += String.fromCharCode(byte);

    }

    return btoa(binary);

}
    

    public toJSON() {

        return {

            publicKey: this.bytesToBase64(this.keyPair.publicKey.bytes),

            privateKey: this.bytesToBase64(this.keyPair.privateKey.bytes),

            peerId: this.publicIdentity.peerId.toString(),

            userName: this.publicIdentity.username.toString()

        };

    }

    public static fromJSON(data: {
        publicKey: string;
        privateKey: string;
        peerId: string;
        userName: string;
    }): PrivateIdentity {

        const keyPair = new KeyPair(
            { toBase64: () => data.publicKey } as any,
            { toBase64: () => data.privateKey } as any
        );

        const publicIdentity = new PublicIdentity(
            PeerId.fromString(data.peerId),
            { toString: () => data.userName } as any,
            { toBase64: () => data.publicKey } as any
        );

        return new PrivateIdentity(keyPair, publicIdentity);

    }

}