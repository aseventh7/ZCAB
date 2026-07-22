import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // 全局前缀：所有接口都以 /api 开头
  app.setGlobalPrefix('api');

  // 全局 DTO 校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 全局异常过滤器 + 统一返回格式拦截器
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger 接口文档
  const config = new DocumentBuilder()
    .setTitle('德馨苑物业管理平台 API')
    .setDescription('内部物业管理系统后端接口文档')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  Logger.log(`==================================`, 'Bootstrap');
  Logger.log(`物业管理系统后端已启动`, 'Bootstrap');
  Logger.log(`接口地址:    http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`接口文档:    http://localhost:${port}/api-docs`, 'Bootstrap');
  Logger.log(`默认管理员:  admin / admin123`, 'Bootstrap');
  Logger.log(`==================================`, 'Bootstrap');
}
bootstrap();
