import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Check if API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set!');
  console.error('Please set it in your .env file or export it in your terminal.');
  process.exit(1);
}

async function bootstrap() {
  // Create the NestJS application
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend access
  app.enableCors();
  
  // Use a different port to avoid conflicts
  const PORT = process.env.PORT || 4000;
  
  // Start the server
  await app.listen(PORT);
  
  console.log(`Application is running on: http://localhost:${PORT}`);
  console.log(`Try sending a POST request to /api/chat with {"message": "What's the weather in Paris?"}`);
}

// Check if this file is being run directly
if (require.main === module) {
  bootstrap();
}

// Export for testing
export { bootstrap };