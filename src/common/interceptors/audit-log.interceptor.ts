import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { User } from '../../user/entities/user.entity';
import { SKIP_AUDIT_LOG_KEY } from '../decorators/skip-audit-log.decorator';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const METHOD_PREFIX: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

const SENSITIVE_KEYS_RE = /password|secret|token|authorization|hash/i;

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
  // '/products/:id' → 'product' | '/files/presign' → 'file' | '/audit-logs' → 'audit_log'
  const first = routePath.split('/').find((s) => s && !s.startsWith(':'));
  if (!first) return 'unknown';
  // kebab-case → snake_case, remove trailing 's'
  return first.replace(/-/g, '_').replace(/s$/, '');
}

function extractEntityId(params: Record<string, string>): string | null {
  return params?.id ?? params?.productId ?? params?.orderId ?? null;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_LOG_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (skip) return;

        const req = context.switchToHttp().getRequest<Request>();
        const method = req.method;

        if (!MUTATION_METHODS.has(method)) return;

        const routePath: string = (req.route as { path?: string })?.path ?? req.path;
        const user = req.user as User | undefined;
        const prefix = METHOD_PREFIX[method];
        const entityType = extractEntityType(routePath);
        const action = `${prefix}_${entityType.toUpperCase()}`;

        this.auditLogsService.log({
          userId: user?.id ?? null,
          role: user?.role ?? null,
          action,
          entityType,
          entityId: extractEntityId(req.params as Record<string, string>),
          details: sanitize({ method, path: routePath, body: req.body, query: req.query }) as Record<string, unknown>,
          ip: req.ip ?? null,
        });
      }),
    );
  }
}
