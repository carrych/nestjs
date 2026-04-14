import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Sets a unique X-Request-ID header on every request.
 * If the client already sends one, it is used as-is (pass-through).
 * The ID is also echoed back in the response header so clients can
 * correlate their requests with server-side audit logs.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existing = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();

    // Make it available on request object for interceptors / services
    (req as Request & { requestId: string }).requestId = requestId;
    // Echo back so clients can trace their request
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
