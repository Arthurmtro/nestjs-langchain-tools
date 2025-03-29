
import {
  Controller,
  Get,
  Post,
  Body,
  Logger,
  Res,
  Sse,
  MessageEvent,
  Headers,
  Query,
  Inject,
  Optional
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CoordinatorService } from '../../src/services/coordinator.service';
import { ToolStreamService } from '../../src/services/tool-stream.service';
import { ToolStreamUpdate } from '../../src/interfaces/tool.interface';

@Controller('api')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  // Using a simple in-memory store for conversations
  // In a production app, you would use Redis or another persistent store
  private readonly conversations = new Map<string, string[]>();

  constructor(
    private readonly coordinatorService: CoordinatorService,
    @Optional() private readonly toolStreamService?: ToolStreamService
  ) {}

  // Helper to get or create a conversation for a session
  private getOrCreateConversation(sessionId: string = 'default'): string[] {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, []);
    }
    return this.conversations.get(sessionId)!;
  }

  // Helper to add a message to a conversation and return the session ID
  private addMessageToConversation(message: string, sessionId: string = 'default'): string {
    const conversation = this.getOrCreateConversation(sessionId);
    conversation.push(message);
    this.logger.log(`Session ${sessionId} history: ${conversation.length} messages`);
    return sessionId;
  }

  @Post('chat')
  async chat(
    @Body() body: { message: string },
    @Headers('session-id') sessionId?: string
  ): Promise<{ response: string }> {
    this.logger.log(`Received chat request: ${JSON.stringify(body)}, sessionId: ${sessionId || 'default'}`);

    if (!body || typeof body.message !== 'string') {
      this.logger.error(`Invalid request body: ${JSON.stringify(body)}`);
      throw new Error('Invalid request body. Expected {message: string}');
    }

    // Add to conversation history
    this.addMessageToConversation(body.message, sessionId);

    this.logger.log(`Processing message: ${body.message}`);
    const response = await this.coordinatorService.processMessage(
      body.message,
      false,
      undefined,
      sessionId
    );
    this.logger.log(`Response generated: ${response}`);

    // Add the response to conversation history too
    this.addMessageToConversation(response, sessionId);

    return { response };
  }

  @Post('chat/stream')
  async chatStream(
    @Body() body: { message: string },
    @Res() res: Response,
    @Headers('accept') accept: string,
    @Headers('session-id') sessionId?: string
  ): Promise<void> {
    this.logger.log(`Received streaming chat request: ${JSON.stringify(body)}, sessionId: ${sessionId || 'default'}`);

    if (!body || typeof body.message !== 'string') {
      this.logger.error(`Invalid request body: ${JSON.stringify(body)}`);
      res.status(400).json({ error: 'Invalid request body. Expected {message: string}' });
      return;
    }

    // Add to conversation history
    this.addMessageToConversation(body.message, sessionId);

    // Check if the client supports event-stream
    const wantsEventStream = accept && accept.includes('text/event-stream');

    if (wantsEventStream) {
      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Handle client disconnect
      res.on('close', () => {
        this.logger.log('Client closed connection');
        res.end();
      });

      let fullResponse = '';

      // Setup tool streaming if available
      if (this.toolStreamService?.isStreamingEnabled()) {
        this.toolStreamService.setCallback((update: ToolStreamUpdate) => {
          res.write(`data: ${JSON.stringify({ toolUpdate: update })}\n\n`);
          // Ensure the data is sent immediately
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        });
      }
      
      // Stream the response
      try {
        await this.coordinatorService.processMessage(
          body.message,
          true, // Enable streaming
          (token: string) => {
            fullResponse += token;
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
            // Ensure the data is sent immediately
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          },
          sessionId
        );

        // Add the complete response to conversation history
        this.addMessageToConversation(fullResponse, sessionId);

        // Signal completion
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Streaming error: ${err.message}`);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    } else {
      // Fall back to regular JSON response for clients that don't support SSE
      try {
        const fullResponse = await this.coordinatorService.processMessage(body.message);

        // Add the response to conversation history
        this.addMessageToConversation(fullResponse, sessionId);

        res.json({ response: fullResponse });
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Error processing message: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    }
  }

  @Sse('chat/sse')
  chatSSE(
    @Headers('message') headerMessage: string,
    @Query('message') queryMessage: string,
    @Headers('session-id') sessionId?: string,
    @Query('session-id') querySessionId?: string
  ): Observable<MessageEvent> {
    const message = queryMessage || headerMessage;
    const session = querySessionId || sessionId || 'default';

    this.logger.log(`Received SSE chat request: message=${message}, sessionId=${session}`);

    if (!message) {
      throw new Error('Message is required. Pass it as a query parameter: ?message=your_message');
    }

    // Add to conversation history
    this.addMessageToConversation(message, session);

    // Create a subject to push tokens to
    const subject = new Subject<MessageEvent>();

    let fullResponse = '';
    
    // Setup tool streaming if available
    if (this.toolStreamService?.isStreamingEnabled()) {
      this.toolStreamService.setCallback((update: ToolStreamUpdate) => {
        subject.next({ data: { toolUpdate: update } });
      });
    }

    // Process the message and stream tokens
    this.coordinatorService.processMessage(
      message,
      true,
      (token: string) => {
        fullResponse += token;
        subject.next({ data: { token } });
      },
      sessionId
    )
    .then(() => {
      // Add the complete response to conversation history
      this.addMessageToConversation(fullResponse, session);

      // Complete the stream when done
      subject.next({ data: { done: true } });
      subject.complete();
    })
    .catch((error) => {
      // Handle errors
      const err = error as Error;
      this.logger.error(`SSE error: ${err.message}`);
      subject.next({ data: { error: err.message } });
      subject.complete();
    });

    return subject.asObservable();
  }

  @Get('agents')
  getAgents(): { agents: Array<{ name: string; description: string }> } {
    // Get a list of all available agents for informational purposes
    // We need to access the agentDiscoveryService through the coordinator
    const agents = (this.coordinatorService as any).agentDiscoveryService?.getAllAgents() || [];
    return {
      agents: agents.map(agent => ({
        name: agent.name,
        description: agent.description
      }))
    };
  }
}