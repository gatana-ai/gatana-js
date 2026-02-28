import { client } from './apiv2/client.gen.js';
import * as sdk from './apiv2/sdk.gen.js';
import createDebug from 'debug';
import { Config } from './api/client/types.gen.js';
import {
  ConfigLoader,
  EnvConfigStrategy,
  FileConfigStrategy,
  GatanaConfig,
  GatanaOptions,
  OptionsConfigStrategy,
} from './index.js';
const debug = createDebug('gatana');

/**
 * Gatana2 is representing a more REST-ful API where the object returned from GET can be used directly in POST/PUT/PATCH requests.
 */
export class Gatana2 {
  public api = sdk;
  public readonly config: GatanaConfig;
  constructor(arg?: { options?: GatanaOptions; configLoader?: ConfigLoader; isCli?: boolean }) {
    // Try to get config from file if not provided via options or env vars
    const configLoader =
      arg?.configLoader ||
      new ConfigLoader([new OptionsConfigStrategy(arg?.options), new EnvConfigStrategy(), new FileConfigStrategy()]);

    try {
      this.config = configLoader.getConfig();

      const clientConfig = {
        baseUrl: new URL('/api/v2/', this.config.baseUrl).toString(),
        auth: this.config.token,
      } satisfies Config;
      client.setConfig(clientConfig);

      // Add verbose request/response logging via debug
      const debugHttp = createDebug('gatana:http');
      client.interceptors.request.use(request => {
        debugHttp(`→ ${request.method} ${request.url}`);
        return request;
      });
      client.interceptors.response.use((response, request) => {
        debugHttp(`← ${response.status} ${response.statusText} ${request.method} ${request.url}`);
        return response;
      });
      client.interceptors.error.use((error, response, request) => {
        debugHttp(`✗ ${response.status} ${response.statusText} ${request.method} ${request.url}`, error);
        return error;
      });

      debug('Gatana initialized with config', clientConfig);
    } catch (error: any) {
      debug('Failed to initialize', error);
      if (arg?.isCli && error.message === 'No valid configuration found from any strategy') {
        console.error('Warning: No valid configuration found. Run "gatana config login" to set up your credentials.');
        this.config = {
          baseUrl: 'https://NO_ORGANIZATION_SET.gatana.ai',
          token: async () => 'PLEASE_SET_UP_CONFIGURATION',
        };
      } else {
        console.error('Error initializing Gatana:', error.message);
        process.exit(1);
      }
    }
  }

  getOpenApiSpecUrl() {
    return new URL('/api/v2/openapi.json', this.config.baseUrl).toString();
  }
}
