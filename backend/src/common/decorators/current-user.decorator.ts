import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUserPayload {
  id: number;
  username: string;
  role: string;
  realName?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtUserPayload = request.user;
    return data ? user?.[data] : user;
  },
);
