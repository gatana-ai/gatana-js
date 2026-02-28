import { createClient } from '@hey-api/openapi-ts';

createClient({
  input: process.env.OVERRIDE_OPENAPI_URL || 'https://gatana.ai/api/v1/openapi.json',
  output: {
    format: false,
    path: 'lib/api',
  },
  plugins: [
    {
      baseUrl: false,
      throwOnError: false,
      name: '@hey-api/client-fetch',
    },
  ],
});

createClient({
  input: process.env.OVERRIDE_OPENAPI_URL?.replace('v1', 'v2') || 'https://gatana.ai/api/v2/openapi.json',
  output: {
    format: false,
    path: 'lib/apiv2',
  },
  plugins: [
    {
      baseUrl: false,
      throwOnError: false,
      name: '@hey-api/client-fetch',
    },
  ],
});
