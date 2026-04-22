import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditOutcome } from '../../audit-logs/entities/audit-log.entity';
import { User } from '../../user/entities/user.entity';
import { SKIP_AUDIT_LOG_KEY } from '../decorators/skip-audit-log.decorator';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const METHOD_PREFIX: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/** Keys whose values must never appear in audit log details */
const SENSITIVE_KEYS_RE = /password|secret|token|authorization|hash|credential/i;

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS_RE.test(key))
      .map(([key, val]) => [key, sanitize(val)]),
  );
}

function extractEntityType(routePath: string): string {
  const first = routePath.split('/').find((s) => s && !s.startsWith(':'));
  if (!first) return 'unknown';
  return first.replace(/-/g, '_').replace(/s$/, '');
}

function extractEntityId(params: Record<string, string>): string | null {
  return params?.id ?? params?.productId ?? params?.orderId ?? params?.paymentId ?? null;
}

type RequestWithExtras = Request & { requestId?: string };

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip || context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<RequestWithExtras>();
    const method = req.method;

    if (!MUTATION_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.record(context, req, AuditOutcome.SUCCESS),
        error: () => this.record(context, req, AuditOutcome.FAILURE),
      }),
    );
  }

  private record(context: ExecutionContext, req: RequestWithExtras, outcome: AuditOutcome): void {
    const method = req.method;
    const routePath: string = (req.route as { path?: string })?.path ?? req.path;
    const user = req.user as User | undefined;
    const prefix = METHOD_PREFIX[method] ?? method;
    const entityType = extractEntityType(routePath);
    const action = `${prefix}_${entityType.toUpperCase()}`;

    this.auditLogsService.log({
      userId: user?.id ?? null,
      role: user?.role ?? null,
      action,
      outcome,
      correlationId: req.requestId ?? null,
      entityType,
      entityId: extractEntityId(req.params as Record<string, string>),
      details: sanitize({
        method,
        path: routePath,
        body: req.body as unknown,
        query: req.query,
      }) as Record<string, unknown>,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
    });
  }
}
