import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface CurrentUserPayload {
  id: string;
  email: string;
  name: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    if (!request.user) {
      throw new Error(
        '@CurrentUser() used on a route not protected by JwtAuthGuard',
      );
    }
    return request.user;
  },
);
