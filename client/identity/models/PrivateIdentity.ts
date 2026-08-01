import { KeyPair } from "../KeyPair";
import { PublicIdentity } from "./PublicIdentity";
import { PeerId } from "../valueObjects/PeerID";
import { PublicKey } from "../valueObjects/PublicKey";
import { PrivateKey } from "../valueObjects/PrivateKey";

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

    public getPrivateIdentity(): PrivateIdentity {
        return this;
    }

    public toJSON() {

        return {

            publicKey: this.keyPair.publicKey.toBase64(),

            privateKey: this.keyPair.privateKey.toBase64(),

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
            PublicKey.fromBase64(data.publicKey),
            PrivateKey.fromBase64(data.privateKey)
        );

        const publicIdentity = new PublicIdentity(
            PeerId.fromString(data.peerId),
            { toString: () => data.userName } as any,
            keyPair.publicKey
        );

        return new PrivateIdentity(keyPair, publicIdentity);

    }

}
