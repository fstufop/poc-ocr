import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>('port');
  const apiPrefix = configService.getOrThrow<string>('apiPrefix');

  app.setGlobalPrefix(apiPrefix);

  // Validação na borda: qualquer DTO decorado com class-validator é checado.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove propriedades não declaradas no DTO
      forbidNonWhitelisted: true, // rejeita payloads com propriedades extras
      transform: true, // converte tipos primitivos (ex.: string -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors();
  app.enableShutdownHooks();

  if (configService.get('env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('POC OCR API')
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'x-api-key' },
        'x-api-key',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
  Logger.log(
    `🚀 Aplicação rodando em http://localhost:${port}/${apiPrefix}`,
    'Bootstrap',
  );
}

void bootstrap();
