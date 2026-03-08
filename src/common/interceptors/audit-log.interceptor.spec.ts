import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';

import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { UserRole } from '../../user/enums/user-role.enum';

const MOCK_USER = { id: 1, email: 'user@example.com', role: UserRole.USER };

function makeContext(opts: {
  method?: string;
  routePath?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: object | null;
  skipMetadata?: boolean;
}): ExecutionContext {
  const {
    method = 'POST',
    routePath = '/products',
    params = {},
    body = {},
    user = MOCK_USER,
    skipMetadata = false,
  } = opts;

  const reflectorMock = (context: ExecutionContext['getHandler'] | ExecutionContext['getClass']) =>
    void context;
  void reflectorMock;

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        route: { path: routePath },
        path: routePath,
        params,
        body,
        query: {},
        ip: '127.0.0.1',
        user,
      }),
    }),
    _skipMetadata: skipMetadata,
  } as unknown as ExecutionContext;
}

function makeHandler(response: unknown = { ok: true }): CallHandler {
  return { handle: () => of(response) };
}

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let logSpy: jest.Mock;
  let reflector: Reflector;

  beforeEach(() => {
    logSpy = jest.fn();
    const auditLogsService = { log: logSpy } as unknown as AuditLogsService;
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    interceptor = new AuditLogInterceptor(auditLogsService, reflector);
  });

  // ─── Action derivation ────────────────────────────────────────────────────

  it('POST /products → action CREATE_PRODUCT, entityType product', async () => {
    const ctx = makeContext({ method: 'POST', routePath: '/products' });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_PRODUCT', entityType: 'product' }),
    );
  });

  it('PATCH /orders/:id → action UPDATE_ORDER, entityId from params', async () => {
    const ctx = makeContext({ method: 'PATCH', routePath: '/orders/:id', params: { id: '42' } });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_ORDER', entityType: 'order', entityId: '42' }),
    );
  });

  it('DELETE /files/:id → action DELETE_FILE, entityId from params', async () => {
    const ctx = makeContext({
      method: 'DELETE',
      routePath: '/files/:id',
      params: { id: 'some-uuid' },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE_FILE', entityType: 'file', entityId: 'some-uuid' }),
    );
  });

  it('PUT /payments/:id → action UPDATE_PAYMENT', async () => {
    const ctx = makeContext({ method: 'PUT', routePath: '/payments/:id', params: { id: '7' } });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_PAYMENT', entityType: 'payment' }),
    );
  });

  it('PATCH /stocks/product/:productId → action UPDATE_STOCK, entityId from productId', async () => {
    const ctx = makeContext({
      method: 'PATCH',
      routePath: '/stocks/product/:productId',
      params: { productId: '3' },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_STOCK', entityType: 'stock', entityId: '3' }),
    );
  });

  it('POST /audit-logs-style kebab path → snake_case entity type', async () => {
    const ctx = makeContext({ method: 'POST', routePath: '/audit-logs' });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_AUDIT_LOG', entityType: 'audit_log' }),
    );
  });

  // ─── Skipping ─────────────────────────────────────────────────────────────

  it('GET request → NOT logged', async () => {
    const ctx = makeContext({ method: 'GET', routePath: '/products' });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('@SkipAuditLog() on handler → NOT logged', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const ctx = makeContext({ method: 'POST', routePath: '/auth/login' });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).not.toHaveBeenCalled();
  });

  // ─── User context ─────────────────────────────────────────────────────────

  it('captures userId and role from req.user', async () => {
    const ctx = makeContext({
      method: 'POST',
      routePath: '/products',
      user: { id: 99, role: UserRole.ADMIN },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 99, role: UserRole.ADMIN }),
    );
  });

  it('userId null when unauthenticated (no req.user)', async () => {
    const ctx = makeContext({ method: 'POST', routePath: '/products', user: null });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, role: null }),
    );
  });

  // ─── Sanitization ─────────────────────────────────────────────────────────

  it('strips password from details.body', async () => {
    const ctx = makeContext({
      method: 'POST',
      routePath: '/users',
      body: { email: 'x@x.com', password: 'secret123' },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    const call = logSpy.mock.calls[0][0] as { details: { body: Record<string, unknown> } };
    expect(call.details.body).not.toHaveProperty('password');
    expect(call.details.body).toHaveProperty('email', 'x@x.com');
  });

  it('strips token, secret, passwordHash from details.body', async () => {
    const ctx = makeContext({
      method: 'PATCH',
      routePath: '/users/:id',
      body: { token: 'abc', secret: 'shhh', passwordHash: 'xyz', name: 'keep' },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    const call = logSpy.mock.calls[0][0] as { details: { body: Record<string, unknown> } };
    expect(call.details.body).not.toHaveProperty('token');
    expect(call.details.body).not.toHaveProperty('secret');
    expect(call.details.body).not.toHaveProperty('passwordHash');
    expect(call.details.body).toHaveProperty('name', 'keep');
  });

  it('strips sensitive keys recursively in nested objects', async () => {
    const ctx = makeContext({
      method: 'POST',
      routePath: '/orders',
      body: { user: { password: 'hidden', email: 'kept' }, amount: 100 },
    });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    const call = logSpy.mock.calls[0][0] as {
      details: { body: { user: Record<string, unknown> } };
    };
    expect(call.details.body.user).not.toHaveProperty('password');
    expect(call.details.body.user).toHaveProperty('email', 'kept');
  });

  // ─── IP ───────────────────────────────────────────────────────────────────

  it('captures ip from req.ip', async () => {
    const ctx = makeContext({ method: 'POST', routePath: '/products' });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ ip: '127.0.0.1' }));
  });
});
