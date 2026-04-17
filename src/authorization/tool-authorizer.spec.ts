import { DEFAULT_TOOL_AUTHORIZER } from './tool-authorizer.provider';

describe('DEFAULT_TOOL_AUTHORIZER', () => {
  it('allows tools without auth metadata', async () => {
    const decision = await DEFAULT_TOOL_AUTHORIZER.authorize({
      toolName: 't',
      metadata: {},
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('denies tools declaring roles when no authorizer is wired', async () => {
    const decision = await DEFAULT_TOOL_AUTHORIZER.authorize({
      toolName: 'delete_user',
      metadata: { roles: ['admin'] },
    });
    expect(decision).toMatchObject({ allowed: false });
  });

  it('denies tools declaring a policy when no authorizer is wired', async () => {
    const decision = await DEFAULT_TOOL_AUTHORIZER.authorize({
      toolName: 't',
      metadata: { policy: 'super-secret' },
    });
    expect(decision).toMatchObject({ allowed: false });
  });
});
