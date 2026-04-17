module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/test/integration/'],
  // Some LangChain v1 packages ship ESM-only (mistralai, langgraph, etc.).
  // pnpm unpacks them under node_modules/.pnpm. Transform them so Jest can load them.
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:@langchain|langchain|@mistralai|@pinecone-database|uuid)/)',
  ],
};
