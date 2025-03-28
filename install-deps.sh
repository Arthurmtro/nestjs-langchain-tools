#!/bin/bash

# Install dev dependencies
npm install --save-dev @types/node typescript rimraf @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint prettier eslint-config-prettier jest ts-jest @types/jest @nestjs/testing

# Install peer dependencies for development
npm install --save-peer @nestjs/common @nestjs/core reflect-metadata rxjs zod @langchain/core @langchain/openai langchain

echo "Dependencies installed successfully"