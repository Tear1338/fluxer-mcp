import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node22',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      '@fluxerjs/rest',
      '@fluxerjs/types',
      '@fluxerjs/ws',
      '@modelcontextprotocol/server',
      'cockatiel',
      'pino',
      'undici',
      'zod',
    ],
  },
});
