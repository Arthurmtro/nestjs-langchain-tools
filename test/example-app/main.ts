import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  console.log(`\n🧭  Travel Concierge demo`);
  console.log(`    UI            http://localhost:${port}/`);
  console.log(`    POST /api/chat         sync chat`);
  console.log(`    GET  /api/chat/stream  SSE stream`);
  console.log(`    POST /api/chat/resume  HITL resume`);
  console.log(`    POST /api/config       switch model at runtime`);
  console.log(`    GET  /api/usage        token + cost telemetry`);
  console.log(`    GET  /api/catalogue    provider/model/agent catalogue\n`);
  console.log(`  💡 Set your API key via the Settings panel in the UI`);
  console.log(`     (or via OPENAI_API_KEY / ANTHROPIC_API_KEY / XAI_API_KEY env vars).`);
}

if (require.main === module) {
  void bootstrap();
}

export { bootstrap };
