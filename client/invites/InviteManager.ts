import sodium from "libsodium-wrappers";

import { PrivateIdentity } from "../identity/models/PrivateIdentity";
import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { resolveBootstrapUrl } from "../bootstrap/bootstrapConfig";

export type InvitePayload = {
    version: 1;
    peerId: string;
    username: string;
    publicKey: string;
    fingerprint: string;
    bootstrapUrl: string;
};

export type ParsedInvite = {
    payload: InvitePayload;
    verified: boolean;
};

export class InviteManager {

    public static async createInvite(
        identity: PrivateIdentity
    ): Promise<InvitePayload> {

        const publicIdentity =
            identity.getPublicIdentity();

        const publicKey =
            publicIdentity.publicKey;

        return {
            version: 1,
            peerId: publicIdentity.peerId.toString(),
            username: publicIdentity.username.toString(),
            publicKey: publicKey.toBase64(),
            fingerprint: await this.createFingerprint(publicKey),
            bootstrapUrl: resolveBootstrapUrl()
        };

    }

    public static async createInviteLink(
        identity: PrivateIdentity,
        baseUrl: string = window.location.href
    ): Promise<string> {

        const payload =
            await this.createInvite(identity);

        const url =
            new URL(baseUrl);

        url.searchParams.set(
            "invite",
            this.encodePayload(payload)
        );

        return url.toString();

    }

    public static getInviteFromCurrentUrl(): string | undefined {

        const invite =
            new URLSearchParams(window.location.search)
                .get("invite");

        if (!invite) {
            return undefined;
        }

        return new URL(window.location.href).toString();

    }

    public static async parseInviteLink(
        value: string
    ): Promise<ParsedInvite> {

        const rawInvite =
            this.extractInviteValue(value);

        const payload =
            this.decodePayload(rawInvite);

        const publicKey =
            PublicKey.fromBase64(payload.publicKey);

        const peerId =
            await PeerId.fromPublicKey(publicKey.bytes);

        const fingerprint =
            await this.createFingerprint(publicKey);

        return {
            payload,
            verified:
                payload.version === 1 &&
                peerId.toString() === payload.peerId &&
                fingerprint === payload.fingerprint
        };

    }

    public static createQrImageUrl(
        inviteLink: string
    ): string {

        const params =
            new URLSearchParams({
                size: "220x220",
                data: inviteLink
            });

        return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;

    }

    public static async createFingerprint(
        publicKey: PublicKey
    ): Promise<string> {

        await sodium.ready;

        const hash =
            sodium.crypto_generichash(
                32,
                publicKey.bytes,
                null,
                "uint8array"
            );

        return sodium
            .to_hex(hash)
            .match(/.{1,4}/g)!
            .join("-");

    }

    private static extractInviteValue(
        value: string
    ): string {

        const trimmed =
            value.trim();

        try {
            const url =
                new URL(trimmed);

            const invite =
                url.searchParams.get("invite");

            if (invite) {
                return invite;
            }
        } catch {
            return trimmed;
        }

        return trimmed;

    }

    private static encodePayload(
        payload: InvitePayload
    ): string {

        const bytes =
            new TextEncoder()
                .encode(JSON.stringify(payload));

        let binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");

    }

    private static decodePayload(
        encoded: string
    ): InvitePayload {

        const padded =
            encoded
                .replace(/-/g, "+")
                .replace(/_/g, "/")
                .padEnd(
                    Math.ceil(encoded.length / 4) * 4,
                    "="
                );

        const binary =
            atob(padded);

        const bytes =
            new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }

        return JSON.parse(
            new TextDecoder().decode(bytes)
        ) as InvitePayload;

    }

}
