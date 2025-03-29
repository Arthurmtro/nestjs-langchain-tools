import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file or export it in your terminal.');
  process.exit(1);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const PORT = process.env.PORT || 4000;

  await app.listen(PORT);

  console.log(`Application is running on: http://localhost:${PORT}`);
  console.log(`Try sending a POST request to /api/chat with {"message": "What's the weather in Paris?"}`);
}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };