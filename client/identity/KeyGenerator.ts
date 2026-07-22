import sodium from "libsodium-wrappers";
import { KeyPair } from "./KeyPair";
import { PublicKey } from "./valueObjects/PublicKey";
import { PrivateKey } from "./valueObjects/PrivateKey";

export class KeyGenerator {
    public static async generate(): Promise<KeyPair> {
        await sodium.ready;

        const keyPair = sodium.crypto_sign_keypair();

        return new KeyPair(
            new PublicKey(new Uint8Array(keyPair.publicKey)),
            new PrivateKey(new Uint8Array(keyPair.privateKey))
        );
    }
}
