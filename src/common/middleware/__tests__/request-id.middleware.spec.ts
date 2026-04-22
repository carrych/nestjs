import { Request, Response } from 'express';

import { REQUEST_ID_HEADER, RequestIdMiddleware } from '../request-id.middleware';

function makeReq(headerValue?: string | string[]): Request {
  return {
    headers: headerValue !== undefined ? { [REQUEST_ID_HEADER]: headerValue } : {},
  } as unknown as Request;
}

function makeRes(): { setHeader: jest.Mock; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    headers,
  };
}

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  const next = jest.fn();

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    next.mockClear();
  });

  it('generates a UUID and attaches it when no X-Request-ID header is present', () => {
    const req = makeReq();
    const res = makeRes();

    middleware.use(req, res as unknown as Response, next);

    const id = (req as Request & { requestId: string }).requestId;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
    expect(next).toHaveBeenCalled();
  });

  it('reuses the existing string header instead of generating a new UUID', () => {
    const clientId = 'my-trace-id-abc';
    const req = makeReq(clientId);
    const res = makeRes();

    middleware.use(req, res as unknown as Response, next);

    expect((req as Request & { requestId: string }).requestId).toBe(clientId);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, clientId);
  });

  it('takes the first element when the header is an array (multi-value HTTP header)', () => {
    const first = 'first-id';
    const req = makeReq([first, 'second-id']);
    const res = makeRes();

    middleware.use(req, res as unknown as Response, next);

    expect((req as Request & { requestId: string }).requestId).toBe(first);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, first);
  });
});
