import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'bin/gatana': './src/cli.ts',
  },
  platform: 'node',
  dts: {},
});
