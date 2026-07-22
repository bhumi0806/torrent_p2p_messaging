export type EventHandler = (payload?: any) => void | Promise<void>;

export class EventBus {

    private readonly listeners =
        new Map<string, EventHandler[]>();

    /**
     * Register an event listener.
     */
    public on(

        event: string,

        handler: EventHandler

    ): void {

        if (

            !this.listeners.has(event)

        ) {

            this.listeners.set(

                event,

                []

            );

        }

        this.listeners.get(event)!.push(

            handler

        );

    }

    /**
     * Remove an event listener.
     */
    public off(

        event: string,

        handler: EventHandler

    ): void {

        const handlers =

            this.listeners.get(event);

        if (!handlers) {

            return;

        }

        this.listeners.set(

            event,

            handlers.filter(

                h => h !== handler

            )

        );

    }

    /**
     * Emit an event.
     */
    public async emit(

        event: string,

        payload?: any

    ): Promise<void> {

        const handlers =

            this.listeners.get(event);

        if (!handlers) {

            return;

        }

        for (

            const handler of handlers

        ) {

            await handler(payload);

        }

    }

    /**
     * Register a one-time listener.
     */
    public once(

        event: string,

        handler: EventHandler

    ): void {

        const wrapper: EventHandler =

            async (payload?: any) => {

                this.off(

                    event,

                    wrapper

                );

                await handler(

                    payload

                );

            };

        this.on(

            event,

            wrapper

        );

    }

    /**
     * Remove all listeners.
     */
    public clear(): void {

        this.listeners.clear();

    }

    /**
     * Remove all listeners for one event.
     */
    public removeEvent(

        event: string

    ): void {

        this.listeners.delete(

            event

        );

    }

    /**
     * Check whether an event has listeners.
     */
    public hasListeners(

        event: string

    ): boolean {

        return (

            this.listeners.has(event) &&

            this.listeners.get(event)!.length > 0

        );

    }

    /**
     * Get listener count.
     */
    public listenerCount(

        event: string

    ): number {

        return (

            this.listeners.get(event)?.length ?? 0

        );

    }

}