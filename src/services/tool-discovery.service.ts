import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { tool } from '@langchain/core/tools';
import { ToolInterface } from '@langchain/core/tools';
import { TOOL_METADATA, ToolOptions } from '../decorators/tool.decorator';

@Injectable()
export class ToolDiscoveryService {
  private readonly logger = new Logger(ToolDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

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

  discoverToolsForProvider(instance: any): ToolInterface[] {
    const tools: ToolInterface[] = [];
    const prototype = Object.getPrototypeOf(instance);

    if (!prototype) {
      this.logger.warn(`No prototype found for instance: ${instance.constructor?.name || 'unknown'}`);
      return tools;
    }

    try {
      this.metadataScanner.scanFromPrototype(
        instance,
        prototype,
        (methodName: string) => {
          const method = instance[methodName];
          if (!method) return;

          const toolMetadata: ToolOptions = this.reflector.get(
            TOOL_METADATA,
            method,
          );

          if (toolMetadata) {
            try {
              this.logger.debug(`Creating tool: ${toolMetadata.name}`);
              const toolFn = tool(
                async (input: any) => {
                  try {
                    return await instance[methodName].call(instance, input);
                  } catch (error) {
                    this.logger.error(`Error executing tool ${toolMetadata.name}:`, error.stack);
                    return `Error: ${error.message}`;
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
              this.logger.error(`Error creating tool ${toolMetadata.name}:`, error.stack);
            }
          }
        },
      );
    } catch (error) {
      this.logger.error(`Error scanning prototype for tools:`, error.stack);
    }

    return tools;
  }
}