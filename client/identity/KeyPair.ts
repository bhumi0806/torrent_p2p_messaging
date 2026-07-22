import { PublicKey } from "./valueObjects/PublicKey";
import { PrivateKey } from "./valueObjects/PrivateKey";

/**
 * Holds an Ed25519 key pair.
 */
export class KeyPair {

    public readonly publicKey: PublicKey;
    public readonly privateKey: PrivateKey;

    constructor(
        publicKey: PublicKey,
        privateKey: PrivateKey
    ) {

        this.publicKey = publicKey;
        this.privateKey = privateKey;

        Object.freeze(this);
    }

}