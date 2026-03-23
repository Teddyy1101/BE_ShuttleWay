import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('School Bus Management API')
    .setDescription('Tài liệu API cho hệ thống quản lý xe buýt trường học')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // --- CODE CŨ ---
  // app.enableCors({
  //   origin: 'http://localhost:3000',
  // });

  // --- CODE MỚI ---
  // Tạm thời mở CORS hoàn toàn để Frontend deploy trên Vercel có thể gọi được API mà không bị chặn.
  // (Sau này có domain Vercel chính thức, bạn có thể truyền url đó vào thay vì mở cho tất cả).
  app.enableCors();

  // --- CODE CŨ ---
  // await app.listen(process.env.PORT ?? 8080);

  // --- CODE MỚI ---
  // Render yêu cầu ứng dụng phải lắng nghe ở địa chỉ IP '0.0.0.0' thay vì 'localhost' mặc định
  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on port: ${port}`);
}
bootstrap();