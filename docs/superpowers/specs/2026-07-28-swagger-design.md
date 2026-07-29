# Swagger / OpenAPI Integration — Design Spec

**Date:** 2026-07-28
**Status:** Approved

## Overview

Add Swagger UI (`/docs`) to the POC OCR API using `@nestjs/swagger` with the CLI plugin for automatic `@ApiProperty` inference. Available only in non-production environments.

## Architecture

- **Package:** `@nestjs/swagger` (production dependency)
- **UI path:** `GET /docs`
- **Availability:** `env !== 'production'` guard in `main.ts`
- **Security scheme:** global `ApiKey` (type `apiKey`, in `header`, name `x-api-key`)

## Changes

### `package.json`
Install `@nestjs/swagger`.

### `nest-cli.json`
Add CLI plugin to `compilerOptions.plugins`:
```json
{ "name": "@nestjs/swagger" }
```

### `src/main.ts`
Mount `SwaggerModule` conditionally after app setup:
```ts
if (configService.get('env') !== 'production') {
  const config = new DocumentBuilder()
    .setTitle('POC OCR API')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
```

### `src/modules/analyze/analyze.controller.ts`
- `@ApiTags('analyze')` on class
- `@ApiSecurity('x-api-key')` on class
- Each endpoint: `@ApiConsumes('multipart/form-data')` + `@ApiBody({ schema: { ... file: binary } })` + `@ApiOkResponse({ type: MedicinesAnalysisDto | VaccinesAnalysisDto })`

### `src/modules/token-usage/token-usage.controller.ts`
- `@ApiTags('token-usage')` on class
- `@ApiSecurity('x-api-key')` on class

### `src/health/health.controller.ts`
- `@ApiTags('health')` on class (no security — public route)

### DTOs
No manual `@ApiProperty` needed — the CLI plugin infers types from TypeScript class fields. Only fields typed as `any` or untyped `object` would require explicit decoration (none exist currently).

## Out of Scope
- `@ApiOperation` descriptions (can be added incrementally)
- Swagger in production
- Changes to tests (Swagger decorators are metadata-only)
