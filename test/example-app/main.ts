import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file or export it in your terminal.');
  process.exit(1);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
  
  // Static files are now served by ServeStaticModule in app.module.ts

  const PORT = process.env.PORT || 4000;

  await app.listen(PORT);

  console.log(`🚀 Application is running on: http://localhost:${PORT}`);
  console.log(`📱 Interactive demo available at: http://localhost:${PORT}/streaming-demo.html`);
  console.log(`🔌 API endpoints: 
  - POST /api/chat - Regular chat request
  - POST /api/chat/stream - Streaming chat with SSE
  - GET /api/chat/sse?message=your_message - NestJS SSE endpoint
  - GET /api/agents - List available agents`);
}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };