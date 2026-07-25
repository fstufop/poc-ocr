import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Loga cada requisição HTTP com método, rota e tempo de resposta.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - start;
        this.logger.log(`${method} ${url} ${elapsed}ms`);
      }),
    );
  }
}
