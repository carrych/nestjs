import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Proxy-aware rate limiter guard.
 *
 * The default ThrottlerGuard uses req.ip which, behind a reverse proxy
 * (nginx, load balancer), would be the proxy's IP — rate-limiting ALL
 * users to a shared bucket instead of per-client.
 *
 * With `app.set('trust proxy', 1)` in main.ts, Express populates req.ips
 * from the X-Forwarded-For header. This guard picks the first entry
 * (closest client IP) to correctly track per-client request counts.
 *
 * Set SKIP_THROTTLE=true to bypass all rate limiting (E2E test environment).
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.SKIP_THROTTLE === 'true') return true;
    return super.canActivate(context);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = req['ips'] as string[] | undefined;
    const ip = ips && ips.length > 0 ? ips[0] : ((req['ip'] as string | undefined) ?? 'unknown');
    return Promise.resolve(ip);
  }
}
