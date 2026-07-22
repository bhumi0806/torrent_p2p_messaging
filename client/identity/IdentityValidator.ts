import { PrivateIdentity } from "./models/PrivateIdentity";

export class IdentityValidator {

    /**
     * Validate loaded identity.
     */
    public static validate(
        identity: PrivateIdentity
    ): boolean {

        if (!identity) {
            return false;
        }

        if (!identity.getKeyPair()) {
            return false;
        }

        if (!identity.getPublicIdentity()) {
            return false;
        }

        if (!identity.getPublicIdentity().peerId) {
            return false;
        }

        if (!identity.getPublicIdentity().username) {
            return false;
        }

        return true;

    }

}