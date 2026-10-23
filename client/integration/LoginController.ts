import { IdentityManager } from "../identity/IdentityManager";
import { IdentityStorage } from "../identity/IdentityStorage";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { resolveBootstrapUrl } from "../bootstrap/bootstrapConfig";
import { PrivateIdentity } from "../identity/models/PrivateIdentity";

export class LoginController {

    constructor(

        private readonly identityManager: IdentityManager,

        private readonly bootstrapClient: BootstrapClient,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Initialize login.
     */
    public async initialize(
        options: {
            restoreStored?: boolean;
        } = {}
    ): Promise<void> {

        let identity: PrivateIdentity | undefined | null;

        identity =
            this.identityManager.getIdentity();

        if (!identity && options.restoreStored) {
            identity =
                this.identityManager.loadStoredIdentity();
        }

        if (!identity) {

            const input = document.getElementById("me") as HTMLInputElement;
            const username = input.value.trim();
            if (!username) {
               throw new Error("Username is required. Please enter a username.");
            }

            IdentityStorage.saveUsername(username);
            identity = await this.identityManager.initialize(username);

        }

        this.fillUsernameInput(identity);

        this.context.setIdentity(identity);
        this.bootstrapClient.setIdentity(identity);

        if (this.bootstrapClient.getState().isConnected()) {
            this.eventBus.emit("LOGIN_SUCCESS", identity);
            return;
        }

        try {
            await this.bootstrapClient.connect(

                resolveBootstrapUrl()

            );
        } catch (error) {
            throw new Error(`Failed to connect to bootstrap server: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.eventBus.emit("LOGIN_SUCCESS",identity);

    }

    public async restoreStoredLogin(): Promise<boolean> {

        this.fillUsernameFromStorage();

        const identity =
            this.identityManager.loadStoredIdentity();

        if (!identity) {
            return false;
        }

        await this.initialize({
            restoreStored: true
        });

        return true;

    }

    public fillUsernameFromStorage(): void {

        const input =
            document.getElementById("me") as HTMLInputElement | null;

        if (!input || input.value.trim()) {
            return;
        }

        const username =
            IdentityStorage.loadUsername();

        if (!username) {
            return;
        }

        input.value = username;

    }

    /**
     * Register application events.
     */
    public register(): void {

        this.eventBus.on(

            "LOGIN",

            async () => {

                await this.initialize();

            }

        );

        this.eventBus.on(

            "LOGOUT",

            async () => {

                await this.logout();

            }

        );

    }

    private fillUsernameInput(
        identity: PrivateIdentity
    ): void {

        const input =
            document.getElementById("me") as HTMLInputElement | null;

        if (!input) {
            return;
        }

        input.value =
            identity
                .getPublicIdentity()
                .username
                .toString();

    }

    /**
     * Logout.
     */
    public async logout(): Promise<void> {

        const identity =

            this.context.getIdentity();

        if (!identity) {

            return;

        }

        await this.bootstrapClient.unregister(

            identity.getPeerId()

        );

        this.context.clearIdentity();

        this.eventBus.emit(

            "LOGOUT_SUCCESS"

        );

    }

}
