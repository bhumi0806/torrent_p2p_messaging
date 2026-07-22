import sodium from "libsodium-wrappers";

import { SessionKey } from "./models/SessionKey";
import { EncryptedMessage } from "./models/EncryptedMessage";

import { NonceGenerator } from "./NonceGenerator";
import { EncryptionAlgorithm } from "./types/EncryptionAlgorithm";

export class CryptoBox {

    /**
     * Encrypt a message.
     */
    public static encrypt(
        plaintext: string,
        sessionKey: SessionKey
    ): EncryptedMessage {

        return this.encryptBytes(
            sodium.from_string(plaintext),
            sessionKey
        );

    }

    /**
     * Encrypt raw bytes.
     */
    public static encryptBytes(
        plaintext: Uint8Array,
        sessionKey: SessionKey
    ): EncryptedMessage {

        const nonce =
            NonceGenerator.generate();

        const cipherText =
            sodium.crypto_secretbox_easy(

                plaintext,

                nonce,

                sessionKey.getBytes()

            );

        return new EncryptedMessage(

            cipherText,

            nonce,

            EncryptionAlgorithm.XCHACHA20_POLY1305

        );

    }

    /**
     * Decrypt a message.
     */
    public static decrypt(
        encryptedMessage: EncryptedMessage,
        sessionKey: SessionKey
    ): string {

        const plaintext =
            this.decryptBytes(
                encryptedMessage,
                sessionKey
            );

        return sodium.to_string(
            plaintext
        );

    }

    /**
     * Decrypt raw bytes.
     */
    public static decryptBytes(
        encryptedMessage: EncryptedMessage,
        sessionKey: SessionKey
    ): Uint8Array {

        return sodium.crypto_secretbox_open_easy(

            encryptedMessage.getCipherText(),

            encryptedMessage.getNonce(),

            sessionKey.getBytes()

        );

    }

}