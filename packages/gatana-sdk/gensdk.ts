import { createClient } from '@hey-api/openapi-ts';

createClient({
  input: process.env.OVERRIDE_OPENAPI_URL || 'https://hello.gatana.ai/api/v1/openapi.json',
  output: {
    format: false,
    path: 'src/api',
  },
  plugins: [
    {
      baseUrl: false,
      throwOnError: true,
      name: '@hey-api/client-fetch',
    },
  ],
});

createClient({
  input: process.env.OVERRIDE_OPENAPI_URL?.replace('v1', 'v2') || 'https://hello.gatana.ai/api/v2/openapi.json',
  output: {
    format: false,
    path: 'src/apiv2',
  },
  plugins: [
    {
      baseUrl: false,
      throwOnError: true,
      name: '@hey-api/client-fetch',
    },
  ],
});
