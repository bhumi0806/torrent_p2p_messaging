import { PrivateIdentity } from "./models/PrivateIdentity";

export class IdentityStorage {

    private static readonly STORAGE_KEY =
        "bleep.identity";

    private static readonly USERNAME_STORAGE_KEY =
        "bleep.username";

    /**
     * Save identity.
     */
    public static save(
        identity: PrivateIdentity
    ): void {

        const username =
            identity
                .getPublicIdentity()
                .username
                .toString();

        localStorage.setItem(

            this.STORAGE_KEY,

            JSON.stringify(
                identity.toJSON()
            )

        );

        localStorage.setItem(
            this.USERNAME_STORAGE_KEY,
            username
        );

    }

    /**
     * Load identity.
     */
    public static load():
        PrivateIdentity | null {

        const data =
            localStorage.getItem(
                this.STORAGE_KEY
            );

        if (!data) {

            return null;

        }

        try {
            return PrivateIdentity.fromJSON(
                JSON.parse(data)
            );
        } catch (error) {
            console.warn(
                "IdentityStorage: failed to load stored identity.",
                error
            );

            return null;
        }

    }

    public static saveUsername(
        username: string
    ): void {

        const trimmed =
            username.trim();

        if (!trimmed) {
            return;
        }

        localStorage.setItem(
            this.USERNAME_STORAGE_KEY,
            trimmed
        );

    }

    public static loadUsername(): string | null {

        return localStorage.getItem(
            this.USERNAME_STORAGE_KEY
        );

    }

    /**
     * Check if identity exists.
     */
    public static exists(): boolean {

        return (
            localStorage.getItem(
                this.STORAGE_KEY
            ) !== null
        );

    }

    /**
     * Delete stored identity.
     */
    public static clear(): void {

        localStorage.removeItem(
            this.STORAGE_KEY
        );

        localStorage.removeItem(
            this.USERNAME_STORAGE_KEY
        );

    }

}
