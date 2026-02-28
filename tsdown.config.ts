import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: './lib/index.ts',
    'bin/gatana': './src/cli.ts',
  },
  platform: 'node',
  dts: {},
});
