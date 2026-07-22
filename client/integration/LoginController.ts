import { IdentityManager } from "../identity/IdentityManager";
import { IdentityStorage } from "../identity/IdentityStorage";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { resolveBootstrapUrl } from "../bootstrap/bootstrapConfig";

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
    public async initialize(): Promise<void> {

        let identity: any;

        if (

            this.identityManager.getIdentity()

        ) {

            identity =

                this.identityManager.getIdentity();

        }

        else {

            const input = document.getElementById("me") as HTMLInputElement;
            const username = input.value.trim();
            if (!username) {
               throw new Error("Username is required. Please enter a username.");
            }

            IdentityStorage.clear();
            identity = await this.identityManager.initialize(username);

        }

        this.context.setIdentity(identity);
        this.bootstrapClient.setIdentity(identity);

        try {
            await this.bootstrapClient.connect(

                resolveBootstrapUrl()

            );
        } catch (error) {
            throw new Error(`Failed to connect to bootstrap server: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.eventBus.emit("LOGIN_SUCCESS",identity);

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