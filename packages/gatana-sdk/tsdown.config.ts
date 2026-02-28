import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    'api/index': './src/api/index.ts',
    'apiv2/index': './src/apiv2/index.ts',
    config: './src/config.ts',
  },
  platform: 'node',
  dts: {},
});
