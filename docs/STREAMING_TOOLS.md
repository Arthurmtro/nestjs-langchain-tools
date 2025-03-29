# Streaming Tool Execution

This feature allows tools to emit updates during their execution, rather than waiting for completion to return results. This is especially valuable for long-running tools where real-time progress updates improve the user experience.

## Overview

Tool streaming provides:

1. **Real-time progress updates**: See tool execution progress as it happens
2. **Error handling**: Get immediate notification when tools encounter errors
3. **Progress tracking**: Visual indicators of completion percentage
4. **Improved user experience**: Faster feedback for long-running operations

## How to Enable Tool Streaming

### Module Configuration

Enable tool streaming when setting up the module:

```typescript
@Module({
  imports: [
    LangChainToolsModule.forRoot({
      // ... other options
      
      // Enable tool streaming
      enableToolStreaming: true,
      
      // Optional callback for tool streaming events
      onToolStream: (update) => {
        console.log(`[TOOL] ${update.toolName} - ${update.type}: ${update.content || ''}`);
      }
    }),
  ],
  // ...
})
```

### Mark Tools as Streamable

Use the `streaming` option in the `@AgentTool` decorator:

```typescript
@AgentTool({
  name: 'process_data',
  description: 'Process data with progress updates',
  schema: z.object({
    // ... parameters
  }),
  streaming: true, // Enable streaming for this tool
})
async processData(input: any): Promise<string> {
  // Tool implementation
}
```

### Sending Progress Updates

Within your tool method, use the `ToolStreamService` to send updates:

```typescript
@Injectable()
export class DataProcessingAgent {
  constructor(private readonly toolStreamService: ToolStreamService) {}

  @AgentTool({
    name: 'process_data',
    description: 'Process data with streaming updates',
    streaming: true,
  })
  async processData(input: any): Promise<string> {
    // Tool starts automatically with input params
    
    // Send progress updates during processing
    this.toolStreamService.updateToolProgress(
      'process_data', 
      'Step 1: Loading data',
      20 // progress percentage (0-100)
    );
    
    // ... processing ...
    
    this.toolStreamService.updateToolProgress(
      'process_data', 
      'Step 2: Analyzing',
      50
    );
    
    // ... more processing ...
    
    // Tool completion is handled automatically
    return 'Processing complete!';
  }
}
```

## Streaming Update Types

Updates from tools have the following structure:

```typescript
interface ToolStreamUpdate {
  // Type of update
  type: 'start' | 'progress' | 'error' | 'complete';
  
  // Tool that is streaming
  toolName: string;
  
  // Content of the update
  content?: string;
  
  // Progress percentage (0-100) if applicable
  progress?: number;
  
  // Any error information
  error?: string;
  
  // Final result when complete
  result?: string;
}
```

## Consuming Tool Streaming in Frontend Applications

### HTTP Server-Sent Events (SSE)

For streaming endpoints using SSE:

```javascript
const eventSource = new EventSource('/api/chat/sse?message=...');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Handle model token streaming
  if (data.token) {
    // Update UI with token
  }
  
  // Handle tool updates
  if (data.toolUpdate) {
    const { type, toolName, content, progress } = data.toolUpdate;
    
    switch (type) {
      case 'start':
        // Show tool starting
        break;
      case 'progress':
        // Update progress UI
        // Use progress percentage if available
        break;
      case 'complete':
        // Show completion
        break;
      case 'error':
        // Handle error
        break;
    }
  }
}
```

### Fetch API with Streaming

For streaming with the Fetch API:

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 
    'Accept': 'text/event-stream',
    // ...
  },
  body: JSON.stringify({ message }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n\n');
  
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = JSON.parse(line.substring(5));
      
      // Handle tool updates
      if (data.toolUpdate) {
        // Update UI with tool progress
      }
      
      // ... handle other updates
    }
  }
}
```

## Example Applications

See the example streaming tool in `test/example-app/agents/streaming-tool.agent.ts` for a complete implementation.

The demo UI in `test/example-app/streaming-demo.html` shows how to handle tool updates and display them in a user interface.

## Performance Considerations

- For very frequent updates, consider throttling to avoid overwhelming the UI
- Streaming adds some overhead, so only enable it for tools that benefit from progress reporting
- For tools that execute quickly (under 500ms), streaming may not provide significant benefits