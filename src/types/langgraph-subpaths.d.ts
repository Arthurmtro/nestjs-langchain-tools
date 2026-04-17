/**
 * Subpath re-exports for `@langchain/langgraph`. The package ships proper
 * `exports` field entries but our TypeScript moduleResolution is "node"
 * (matching our CJS emit), which doesn't honour subpath exports. Each
 * declaration below just re-exports from the concrete .d.ts under
 * node_modules — letting us `import type { createReactAgent } from
 * '@langchain/langgraph/prebuilt'` throughout the source.
 */
declare module '@langchain/langgraph/prebuilt' {
  export * from '@langchain/langgraph/dist/prebuilt/index';
}

declare module '@langchain/langgraph/channels' {
  export * from '@langchain/langgraph/dist/channels/index';
}

declare module '@langchain/langgraph/web' {
  export * from '@langchain/langgraph/dist/web';
}
