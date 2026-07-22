import { PrivateIdentity } from "./models/PrivateIdentity";

export class KeyStorage {

    private static readonly STORAGE_KEY = "bleep.identity";

    /**
     * Save identity.
     */
    public static save(
        identity: PrivateIdentity
    ): void {

        localStorage.setItem(

            KeyStorage.STORAGE_KEY,

            JSON.stringify(identity.toJSON())

        );

    }

    /**
     * Load identity.
     */
    public static load():
        PrivateIdentity | null {

        const data = localStorage.getItem(

            KeyStorage.STORAGE_KEY

        );

        if (!data) {

            return null;

        }

        return PrivateIdentity.fromJSON(

            JSON.parse(data)

        );

    }

    /**
     * Delete identity.
     */
    public static clear(): void {

        localStorage.removeItem(

            KeyStorage.STORAGE_KEY

        );

    }

    /**
     * Check if identity exists.
     */
    public static exists(): boolean {

        return localStorage.getItem(

            KeyStorage.STORAGE_KEY

        ) !== null;

    }

}