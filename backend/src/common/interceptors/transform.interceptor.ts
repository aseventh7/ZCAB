import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // 分页结果特殊处理
        if (
          data &&
          typeof data === 'object' &&
          'list' in data &&
          'total' in data
        ) {
          return {
            code: 0,
            message: 'success',
            data: data.list,
            total: data.total,
            page: data.page,
            pageSize: data.pageSize,
          };
        }
        return {
          code: 0,
          message: 'success',
          data,
        };
      }),
    );
  }
}
