import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 公开接口装饰器：@Public() 标记的接口不需要登录
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
