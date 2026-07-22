export type RateLimitScope = "auth" | "public" | "authenticated";

interface RateLimitCheckResult {
    allowed: boolean;
    retryAfterMs: number;
}

interface RateLimitBucketState {
    requests: number[];
    blockedUntil: number;
    violationCount: number;
}

interface RateLimitOptions {
    scope: RateLimitScope;
    remoteAddress?: string;
    accountId?: string;
    now?: number;
}

export class RateLimiter {
    private readonly buckets = new Map<string, RateLimitBucketState>();

    public allow(options: RateLimitOptions): boolean {
        const {
            scope,
            remoteAddress,
            accountId,
            now = Date.now()
        } = options;

        if (!this.isEnabled()) {
            return true;
        }

        const ipKey = remoteAddress ? `ip:${remoteAddress}` : "ip:unknown";
        const accountKey = accountId ? `account:${accountId}` : "account:unknown";

        const ipResult = this.checkBucket(
            `${scope}:${ipKey}`,
            this.getIpLimit(scope),
            this.getIpWindowMs(scope),
            scope === "auth",
            now
        );

        if (!ipResult.allowed) {
            return false;
        }

        const accountResult = this.checkBucket(
            `${scope}:${accountKey}`,
            this.getAccountLimit(scope),
            this.getAccountWindowMs(scope),
            scope === "auth",
            now
        );

        return accountResult.allowed;
    }

    private checkBucket(
        bucketKey: string,
        limit: number,
        windowMs: number,
        useBackoff: boolean,
        now: number
    ): RateLimitCheckResult {
        const bucket = this.getBucket(bucketKey);

        this.pruneBucket(bucket, now, windowMs);

        if (bucket.blockedUntil > now) {
            return {
                allowed: false,
                retryAfterMs: Math.max(1, Math.ceil(bucket.blockedUntil - now))
            };
        }

        if (bucket.requests.length >= limit) {
            bucket.violationCount += 1;

            if (useBackoff) {
                const delay = Math.min(
                    this.getBackoffMaxMs(),
                    Math.floor(
                        this.getBackoffBaseMs() *
                        Math.pow(this.getBackoffMultiplier(), bucket.violationCount - 1)
                    )
                );
                bucket.blockedUntil = now + delay;
                return {
                    allowed: false,
                    retryAfterMs: delay
                };
            }

            return {
                allowed: false,
                retryAfterMs: windowMs
            };
        }

        bucket.requests.push(now);
        return {
            allowed: true,
            retryAfterMs: 0
        };
    }

    private getBucket(bucketKey: string): RateLimitBucketState {
        const existing = this.buckets.get(bucketKey);

        if (existing) {
            return existing;
        }

        const created: RateLimitBucketState = {
            requests: [],
            blockedUntil: 0,
            violationCount: 0
        };

        this.buckets.set(bucketKey, created);
        return created;
    }

    private pruneBucket(bucket: RateLimitBucketState, now: number, windowMs: number): void {
        const cutoff = now - windowMs;
        while (bucket.requests.length > 0 && bucket.requests[0] <= cutoff) {
            bucket.requests.shift();
        }
    }

    private isEnabled(): boolean {
        return process.env.RATE_LIMIT_ENABLED !== "false";
    }

    private getIpLimit(scope: RateLimitScope): number {
        switch (scope) {
            case "auth":
                return Number(process.env.RATE_LIMIT_AUTH_IP_MAX_REQUESTS ?? 5);
            case "public":
                return Number(process.env.RATE_LIMIT_PUBLIC_IP_MAX_REQUESTS ?? 60);
            default:
                return Number(process.env.RATE_LIMIT_AUTHENTICATED_IP_MAX_REQUESTS ?? 300);
        }
    }

    private getIpWindowMs(scope: RateLimitScope): number {
        switch (scope) {
            case "auth":
                return Number(process.env.RATE_LIMIT_AUTH_IP_WINDOW_SECONDS ?? 600) * 1000;
            case "public":
                return Number(process.env.RATE_LIMIT_PUBLIC_IP_WINDOW_SECONDS ?? 60) * 1000;
            default:
                return Number(process.env.RATE_LIMIT_AUTHENTICATED_IP_WINDOW_SECONDS ?? 60) * 1000;
        }
    }

    private getAccountLimit(scope: RateLimitScope): number {
        switch (scope) {
            case "auth":
                return Number(process.env.RATE_LIMIT_AUTH_ACCOUNT_MAX_REQUESTS ?? 3);
            case "public":
                return Number(process.env.RATE_LIMIT_PUBLIC_ACCOUNT_MAX_REQUESTS ?? 60);
            default:
                return Number(process.env.RATE_LIMIT_AUTHENTICATED_ACCOUNT_MAX_REQUESTS ?? 300);
        }
    }

    private getAccountWindowMs(scope: RateLimitScope): number {
        switch (scope) {
            case "auth":
                return Number(process.env.RATE_LIMIT_AUTH_ACCOUNT_WINDOW_SECONDS ?? 900) * 1000;
            case "public":
                return Number(process.env.RATE_LIMIT_PUBLIC_ACCOUNT_WINDOW_SECONDS ?? 60) * 1000;
            default:
                return Number(process.env.RATE_LIMIT_AUTHENTICATED_ACCOUNT_WINDOW_SECONDS ?? 60) * 1000;
        }
    }

    private getBackoffBaseMs(): number {
        return Number(process.env.RATE_LIMIT_AUTH_BACKOFF_BASE_SECONDS ?? 30) * 1000;
    }

    private getBackoffMultiplier(): number {
        return Number(process.env.RATE_LIMIT_AUTH_BACKOFF_MULTIPLIER ?? 2);
    }

    private getBackoffMaxMs(): number {
        return Number(process.env.RATE_LIMIT_AUTH_BACKOFF_MAX_SECONDS ?? 900) * 1000;
    }
}
