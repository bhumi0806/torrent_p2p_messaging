export class RetryPolicy {

    public static readonly DEFAULT_INITIAL_DELAY =
        1000; // 1 second

    public static readonly DEFAULT_MAX_DELAY =
        30000; // 30 seconds

    public static readonly DEFAULT_BACKOFF_FACTOR =
        2;

    public static readonly DEFAULT_JITTER =
        500; // milliseconds

    constructor(

        private readonly initialDelay: number =
            RetryPolicy.DEFAULT_INITIAL_DELAY,

        private readonly maxDelay: number =
            RetryPolicy.DEFAULT_MAX_DELAY,

        private readonly backoffFactor: number =
            RetryPolicy.DEFAULT_BACKOFF_FACTOR,

        private readonly jitter: number =
            RetryPolicy.DEFAULT_JITTER

    ) {}

    /**
     * Calculate the next retry delay using
     * exponential backoff with random jitter.
     */
    public nextDelay(
        retryCount: number
    ): number {

        const exponentialDelay = Math.min(

            this.initialDelay *

            Math.pow(

                this.backoffFactor,

                retryCount

            ),

            this.maxDelay

        );

        const randomJitter = Math.floor(

            Math.random() * this.jitter

        );

        return exponentialDelay + randomJitter;

    }

    /**
     * Reset retry policy.
     */
    public reset(): number {

        return this.initialDelay;

    }

}