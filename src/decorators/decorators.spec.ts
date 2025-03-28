import { Test } from '@nestjs/testing';
import { AgentTool, TOOL_METADATA } from './tool.decorator';
import { ToolsAgent, AGENT_METADATA } from './agent.decorator';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';

describe('Decorators', () => {
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [Reflector],
    }).compile();

    reflector = module.get<Reflector>(Reflector);
  });

  describe('AgentTool', () => {
    it('should set metadata on a method', () => {
      class TestClass {
        @AgentTool({
          name: 'test_tool',
          description: 'A test tool',
          schema: z.object({ test: z.string() }),
        })
        testMethod() {
          return 'test';
        }
      }

      const instance = new TestClass();
      const metadata = reflector.get(TOOL_METADATA, instance.testMethod);

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('test_tool');
    });
  });

  describe('ToolsAgent', () => {
    it('should set metadata on a class', () => {
      @ToolsAgent({
        name: 'Test Agent',
        description: 'A test agent',
        systemPrompt: 'You are a test agent',
      })
      class TestClass {}

      const metadata = reflector.get(AGENT_METADATA, TestClass);

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('Test Agent');
    });
  });
});