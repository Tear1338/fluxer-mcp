import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  target: 'node22',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: false,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      '@fluxer-mcp/core',
      '@modelcontextprotocol/client',
      '@modelcontextprotocol/node',
      '@modelcontextprotocol/server',
      'commander',
      'zod',
    ],
  },
});
