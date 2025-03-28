import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ToolDiscoveryService } from './tool-discovery.service';
import { TOOL_METADATA, ToolOptions } from '../decorators/tool.decorator';
import { Injectable } from '@nestjs/common';
import { AgentTool } from '../decorators/tool.decorator';
import { z } from 'zod';

// Mock implementations
class MockDiscoveryService {
  getProviders() {
    return [];
  }
}

class MockMetadataScanner {
  scanFromPrototype(instance: any, prototype: any, callback: (methodName: string) => void) {
    // Manually call the callback for each method we want to simulate scanning
    const methodNames = Object.getOwnPropertyNames(prototype)
      .filter(prop => typeof prototype[prop] === 'function' && prop !== 'constructor');
    
    methodNames.forEach(methodName => callback(methodName));
  }
}

class MockReflector {
  get(metadataKey: string, target: any) {
    return null;
  }
}

// Test class with tools
@Injectable()
class TestService {
  @AgentTool({
    name: 'testTool',
    description: 'A test tool for unit testing',
    schema: z.object({
      input: z.string().describe('The input to the test tool')
    })
  })
  async testTool(input: { input: string }) {
    return `Processed: ${input.input}`;
  }

  @AgentTool({
    name: 'anotherTool',
    description: 'Another test tool',
    schema: z.object({
      value: z.number().describe('A number value')
    })
  })
  async anotherTool(input: { value: number }) {
    return `Result: ${input.value * 2}`;
  }

  // Non-tool method
  regularMethod() {
    return 'This is not a tool';
  }
}

describe('ToolDiscoveryService', () => {
  let service: ToolDiscoveryService;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolDiscoveryService,
        { provide: DiscoveryService, useClass: MockDiscoveryService },
        { provide: MetadataScanner, useClass: MockMetadataScanner },
        { provide: Reflector, useClass: MockReflector },
      ],
    }).compile();

    service = module.get<ToolDiscoveryService>(ToolDiscoveryService);
    discoveryService = module.get<DiscoveryService>(DiscoveryService);
    metadataScanner = module.get<MetadataScanner>(MetadataScanner);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverTools', () => {
    it('should discover tools from all providers', () => {
      // Mock providers
      const testInstance = new TestService();
      const mockProviders = [
        { 
          instance: testInstance,
          metatype: TestService,
          name: 'TestService',
          token: 'TestService',
          isAlias: false
        } as any,
      ];
      
      jest.spyOn(discoveryService, 'getProviders').mockReturnValue(mockProviders);
      
      // Mock tool discovery for the test instance
      jest.spyOn(service, 'discoverToolsForProvider').mockReturnValue([
        {
          name: 'testTool',
          description: 'A test tool for unit testing',
          invoke: jest.fn(),
        } as any,
        {
          name: 'anotherTool',
          description: 'Another test tool',
          invoke: jest.fn(),
        } as any,
      ]);

      const tools = service.discoverTools();
      
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('testTool');
      expect(tools[1].name).toBe('anotherTool');
    });
  });

  describe('discoverToolsForProvider', () => {
    it('should discover tools from a provider instance', () => {
      const testInstance = new TestService();
      
      // Mock the reflector to return tool metadata
      const testToolMetadata: ToolOptions = {
        name: 'testTool',
        description: 'A test tool for unit testing',
        schema: z.object({
          input: z.string().describe('The input to the test tool')
        }),
      };
      
      const anotherToolMetadata: ToolOptions = {
        name: 'anotherTool',
        description: 'Another test tool',
        schema: z.object({
          value: z.number().describe('A number value')
        }),
      };
      
      // Mock the reflector to return the tool metadata for the right methods
      jest.spyOn(reflector, 'get').mockImplementation((key, target) => {
        if (key === TOOL_METADATA) {
          if (target === testInstance.testTool) {
            return testToolMetadata;
          } else if (target === testInstance.anotherTool) {
            return anotherToolMetadata;
          }
        }
        return null;
      });

      const tools = service.discoverToolsForProvider(testInstance);
      
      // Given our setup, we expect 2 tools
      expect(tools).toHaveLength(2);
    });

    it('should handle errors when creating tools', () => {
      const testInstance = new TestService();
      
      // Mock the reflector to return invalid tool metadata
      const invalidMetadata: ToolOptions = {
        name: '',  // Invalid empty name
        description: 'Invalid tool',
        schema: null as any,  // Invalid schema
      };
      
      // In actual implementation, the tool discovery will simply log errors but still return tools
      // even with invalid data, we can only test that it doesn't crash
      jest.spyOn(reflector, 'get').mockReturnValue(invalidMetadata);
      
      // Mock console error to avoid cluttering test output
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // This should not throw but handle the error
      expect(() => {
        service.discoverToolsForProvider(testInstance);
      }).not.toThrow();
    });
  });
});