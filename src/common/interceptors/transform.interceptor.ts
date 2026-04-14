import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T | null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((res: any) => {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        const message = res?.message || 'Success';

        let responseData = res;
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          const { message: _, result, ...rest } = res;
          responseData = result !== undefined ? result : rest;
          // Chỉ chuyển thành null nếu là object rỗng (không phải array)
          if (
            responseData &&
            !Array.isArray(responseData) &&
            typeof responseData === 'object' &&
            Object.keys(responseData).length === 0
          ) {
            responseData = null;
          }
        }

        return {
          statusCode,
          message,
          data: responseData,
        };
      }),
    );
  }
}