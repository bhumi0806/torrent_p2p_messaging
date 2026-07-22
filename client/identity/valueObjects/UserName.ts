/**
 * Represents a user's display name.
 * This is not used for authentication.
 */
export class Username {

    public readonly value: string;

    constructor(value: string) {

        const username = value.trim();

        if (username.length === 0) {
            throw new Error("Username cannot be empty.");
        }

        if (username.length > 32) {
            throw new Error("Username cannot exceed 32 characters.");
        }

        this.value = username;

        Object.freeze(this);
    }

    public toString(): string {
        return this.value;
    }
}