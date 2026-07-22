import { PrivateIdentity } from "./models/PrivateIdentity";

export class IdentityStorage {

    private static readonly STORAGE_KEY =
        "bleep.identity";

    /**
     * Save identity.
     */
    public static save(
        identity: PrivateIdentity
    ): void {

        localStorage.setItem(

            this.STORAGE_KEY,

            JSON.stringify(
                identity.toJSON()
            )

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

        return PrivateIdentity.fromJSON(
            JSON.parse(data)
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

    }

}