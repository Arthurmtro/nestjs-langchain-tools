import { Test, TestingModule } from '@nestjs/testing';
import {
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import { Injectable } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { z } from 'zod';
import { AgentTool } from '../decorators/tool.decorator';
import { Authorize } from '../decorators/authorize.decorator';
import { ToolDiscoveryService } from './tool-discovery.service';
import { TOOL_AUTHORIZER } from '../authorization/tool-authorizer.interface';

class EchoDto {
  @IsString()
  @MinLength(1)
  value!: string;
}

@Injectable()
class EchoService {
  @AgentTool({
    name: 'echo_zod',
    description: 'echoes via a zod schema',
    schema: z.object({ value: z.string() }),
  })
  async echoZod(input: { value: string }) {
    return `zod:${input.value}`;
  }

  @AgentTool({
    name: 'echo_dto',
    description: 'echoes via a class-validator DTO',
    input: EchoDto,
  })
  async echoDto(input: EchoDto) {
    return `dto:${input.value}`;
  }

  @AgentTool({ name: 'admin_only', description: 'admin only', input: EchoDto })
  @Authorize({ roles: ['admin'] })
  async adminOnly(input: EchoDto) {
    return `admin:${input.value}`;
  }
}

describe('ToolDiscoveryService', () => {
  let service: ToolDiscoveryService;

  async function setup(authDecision: boolean | { allowed: boolean; reason?: string } = true) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolDiscoveryService,
        { provide: DiscoveryService, useValue: { getProviders: () => [] } },
        MetadataScanner,
        Reflector,
        {
          provide: TOOL_AUTHORIZER,
          useValue: { authorize: jest.fn().mockResolvedValue(authDecision) },
        },
      ],
    }).compile();
    service = module.get(ToolDiscoveryService);
  }

  it('discovers tools with zod schemas', async () => {
    await setup();
    const tools = service.discoverToolsForProvider(new EchoService());
    const zodTool = tools.find((t) => t.name === 'echo_zod');
    expect(zodTool).toBeDefined();
    const out = await zodTool!.invoke({ value: 'hi' });
    expect(out).toBe('zod:hi');
  });

  it('validates and transforms DTO inputs via class-validator', async () => {
    await setup();
    const tools = service.discoverToolsForProvider(new EchoService());
    const dtoTool = tools.find((t) => t.name === 'echo_dto');
    expect(dtoTool).toBeDefined();
    const out = await dtoTool!.invoke({ value: 'hello' });
    expect(out).toBe('dto:hello');
  });

  it('returns a structured error when DTO validation fails', async () => {
    await setup();
    const tools = service.discoverToolsForProvider(new EchoService());
    const dtoTool = tools.find((t) => t.name === 'echo_dto');
    const out = await dtoTool!.invoke({ value: '' });
    expect(out).toContain('Error: invalid input for echo_dto');
    expect(out).toContain('value');
  });

  it('blocks tools when the authorizer denies', async () => {
    await setup({ allowed: false, reason: 'needs admin' });
    const tools = service.discoverToolsForProvider(new EchoService());
    const admin = tools.find((t) => t.name === 'admin_only');
    const out = await admin!.invoke({ value: 'x' });
    expect(out).toContain('Error: unauthorized to call admin_only');
    expect(out).toContain('needs admin');
  });

  it('lets non-@Authorize tools through even if authorizer is strict', async () => {
    await setup({ allowed: false, reason: 'always deny' });
    const tools = service.discoverToolsForProvider(new EchoService());
    const dto = tools.find((t) => t.name === 'echo_dto');
    const out = await dto!.invoke({ value: 'pass' });
    expect(out).toBe('dto:pass');
  });
});
