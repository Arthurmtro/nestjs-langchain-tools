import { Injectable, Logger, Optional } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { tool } from '@langchain/core/tools';
import { ToolInterface } from '@langchain/core/tools';
import { TOOL_METADATA } from '../decorators/tool.decorator';
import { ToolOptions, ToolStreamUpdateType } from '../interfaces/tool.interface';
import { ToolStreamService } from './tool-stream.service';
import { ToolTimeoutService, ToolTimeoutError } from './tool-timeout.service';

/**
 * Service responsible for discovering and creating LangChain tools from decorated methods
 */
@Injectable()
export class ToolDiscoveryService {
  private readonly logger = new Logger(ToolDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    @Optional() private readonly toolStreamService?: ToolStreamService,
    @Optional() private readonly toolTimeoutService?: ToolTimeoutService,
  ) {}

  /**
   * Discovers all tool methods across all providers
   * 
   * @returns Array of initialized LangChain tools
   */
  discoverTools(): ToolInterface[] {
    this.logger.log('Discovering all tools...');
    const providers = this.discoveryService.getProviders();
    const tools: ToolInterface[] = [];

    providers.forEach((wrapper: InstanceWrapper) => {
      const { instance } = wrapper;
      if (!instance) return;

      const providerTools = this.discoverToolsForProvider(instance);
      tools.push(...providerTools);
    });

    this.logger.log(`Discovered ${tools.length} tools total`);
    return tools;
  }

  /**
   * Discovers tool methods in a specific provider instance
   * 
   * @param instance - Provider instance to scan for tools
   * @returns Array of initialized LangChain tools
   */
  discoverToolsForProvider(instance: unknown): ToolInterface[] {
    const tools: ToolInterface[] = [];
    const prototype = Object.getPrototypeOf(instance);

    if (!prototype) {
      this.logger.warn(`No prototype found for instance: ${
        (instance as any)?.constructor?.name || 'unknown'
      }`);
      return tools;
    }

    try {
      this.metadataScanner.scanFromPrototype(
        instance,
        prototype,
        (methodName: string) => {
          const method = (instance as Record<string, (...args: any[]) => any>)[methodName];
          if (!method) return;

          const toolMetadata: ToolOptions | undefined = this.reflector.get(
            TOOL_METADATA,
            method,
          );

          if (toolMetadata) {
            try {
              this.logger.debug(`Creating tool: ${toolMetadata.name}`);
              const toolFn = tool(
                async (input: unknown) => {
                  const streamingEnabled = this.toolStreamService?.isStreamingEnabled() && toolMetadata.streaming;
                  
                  this.logger.log(
                    `Tool execution: ${toolMetadata.name} ` +
                    `(streaming: ${streamingEnabled ? 'enabled' : 'disabled'}, ` +
                    `service: ${this.toolStreamService?.isStreamingEnabled() ? 'enabled' : 'disabled'}, ` +
                    `tool config: ${toolMetadata.streaming ? 'enabled' : 'disabled'})`
                  );
                  
                  // If streaming is enabled, notify about tool execution start
                  if (streamingEnabled) {
                    this.logger.log(`Starting tool execution with streaming: ${toolMetadata.name}`);
                    this.toolStreamService?.startToolExecution(toolMetadata.name, input as Record<string, any>);
                  }
                  
                  try {
                    // Check if timeout is enabled for this tool
                    const timeoutEnabled = this.toolTimeoutService?.isTimeoutEnabled() || false;
                    let timeoutConfig: { enabled: boolean; durationMs: number } | undefined;
                    
                    if (timeoutEnabled && this.toolTimeoutService) {
                      timeoutConfig = this.toolTimeoutService.getToolTimeoutConfig(toolMetadata);
                      
                      if (timeoutConfig?.enabled) {
                        this.logger.log(
                          `Tool execution with timeout: ${toolMetadata.name} (${timeoutConfig.durationMs}ms)`
                        );
                      }
                    }
                    
                    // Define the execution function
                    const executeTool = async () => {
                      this.logger.log(`Executing tool method: ${toolMetadata.name}`);
                      const result = await method.call(instance, input);
                      this.logger.log(`Tool execution completed: ${toolMetadata.name} with result length: ${result?.length || 0}`);
                      return result;
                    };
                    
                    // Execute with or without timeout
                    let result;
                    if (timeoutEnabled && timeoutConfig && timeoutConfig.enabled && this.toolTimeoutService) {
                      try {
                        const durationMs = timeoutConfig.durationMs;
                        result = await this.toolTimeoutService.executeWithTimeout(
                          executeTool,
                          toolMetadata.name,
                          durationMs
                        );
                      } catch (timeoutError) {
                        // Handle timeout error
                        if (timeoutError instanceof ToolTimeoutError) {
                          const durationMs = timeoutConfig.durationMs;
                          this.logger.warn(
                            `Tool ${toolMetadata.name} timed out after ${durationMs}ms`
                          );
                          
                          // We don't need to notify about timeout here because
                          // the ToolTimeoutService already does that
                          
                          return `Error: Tool execution timed out after ${timeoutConfig.durationMs}ms`;
                        }
                        // Re-throw other errors to be caught by the outer catch
                        throw timeoutError;
                      }
                    } else {
                      // Execute without timeout
                      result = await executeTool();
                    }
                    
                    // Notify about tool execution completion
                    if (streamingEnabled) {
                      this.logger.log(`Reporting tool completion: ${toolMetadata.name}`);
                      
                      // Direct call to the streaming service to ensure it works
                      this.toolStreamService?.completeToolExecution(toolMetadata.name, result);
                    }
                    
                    return result;
                  } catch (error) {
                    const err = error as Error;
                    this.logger.error(
                      `Error executing tool ${toolMetadata.name}:`, 
                      err.stack
                    );
                    
                    // Notify about tool execution error
                    if (streamingEnabled) {
                      this.toolStreamService?.errorToolExecution(toolMetadata.name, err);
                    }
                    
                    return `Error: ${err.message}`;
                  }
                },
                {
                  name: toolMetadata.name,
                  description: toolMetadata.description,
                  schema: toolMetadata.schema,
                },
              );

              tools.push(toolFn);
              this.logger.debug(`Tool ${toolMetadata.name} created successfully`);
            } catch (error) {
              const err = error as Error;
              this.logger.error(
                `Error creating tool ${toolMetadata.name}:`, 
                err.stack
              );
            }
          }
        },
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error scanning prototype for tools:`, err.stack);
    }

    return tools;
  }
}