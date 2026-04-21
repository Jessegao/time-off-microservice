import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Time-Off Microservice')
    .setDescription('API for managing employee time-off requests with HCM integration')
    .setVersion('1.0')
    .addTag('balances', 'Balance management endpoints')
    .addTag('time-off-requests', 'Time-off request management')
    .addTag('approvals', 'Approval workflow endpoints')
    .addTag('hcm', 'HCM integration endpoints')
    .addTag('hcm-webhooks', 'HCM webhook handlers')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
