import { client } from './api/client.gen.js';
import * as sdk from './api/sdk.gen.js';
import createDebug from 'debug';
import { getOrganization, getDefaultOrganization, setOrganizationConfig } from './config.js';
import * as openidClient from 'openid-client';
import { Config } from './api/client/types.gen.js';
const debug = createDebug('gatana');

export interface GatanaOptions {
  apiKey: string;
  orgId?: string;
  baseUrl?: string;
}

export type GatanaConfig = { baseUrl: string; token: () => Promise<string> };
export class ConfigLoader {
  constructor(private strategies: ConfigStrategy[]) {}

  getConfig(): GatanaConfig {
    for (const strategy of this.strategies) {
      const config = strategy.getConfig();
      if (config) {
        return config;
      }
    }
    throw new Error('No valid configuration found from any strategy');
  }
}

export abstract class ConfigStrategy {
  abstract getConfig(): { baseUrl: string; token: () => Promise<string> } | null;
}

export class OptionsConfigStrategy extends ConfigStrategy {
  constructor(private options?: GatanaOptions) {
    super();
  }

  getConfig() {
    if (!this.options) {
      return null;
    }
    if (this.options.apiKey && (this.options.orgId || this.options.baseUrl)) {
      const key = this.options.apiKey;
      const baseUrl = this.options.baseUrl || `https://${this.options.orgId}.gatana.ai`;
      return {
        baseUrl,
        token: async () => key,
      };
    }
    return null;
  }
}

export class EnvConfigStrategy extends ConfigStrategy {
  getConfig() {
    const apiKey = process.env.GATANA_API_KEY;
    const orgId = process.env.GATANA_ORG_ID;
    const overrideBaseUrl = process.env.GATANA_BASE_URL;
    if (apiKey && (orgId || overrideBaseUrl)) {
      return {
        baseUrl: overrideBaseUrl || `https://${orgId}.gatana.ai`,
        token: async () => apiKey,
      };
    }
    return null;
  }
}

export class FileConfigStrategy extends ConfigStrategy {
  constructor(private orgId?: string) {
    super();
  }

  getConfig() {
    let orgId = this.orgId || process.env.GATANA_ORG_ID || getDefaultOrganization();
    if (!orgId) {
      return null;
    }
    debug(`FileConfigLoader loading config for orgId=${orgId}`);
    const tenantConfig = getOrganization(orgId);
    if (!tenantConfig) {
      return null;
    }
    return {
      baseUrl: tenantConfig.baseUrl,
      token: async () => {
        if (tenantConfig?.apiKey) {
          return tenantConfig.apiKey;
        } else if (
          tenantConfig?.tokens?.access_token &&
          tenantConfig.tokens.expires_at &&
          tenantConfig.tokens.expires_at > Math.floor(Date.now() / 1000) + 60
        ) {
          return tenantConfig.tokens.access_token;
        } else if (tenantConfig.tokens?.refresh_token) {
          debug('Access token expired or about to expire, attempting to refresh');
          // Try to refresh the token
          const config = await openidClient.discovery(
            new URL(`/.well-known/openid-configuration`, tenantConfig.baseUrl),
            `${orgId}-cli`
          );
          try {
            const token = await openidClient.refreshTokenGrant(config, tenantConfig.tokens.refresh_token);
            if (token) {
              setOrganizationConfig(orgId, {
                tokens: {
                  access_token: token.access_token,
                  refresh_token: token.refresh_token || tenantConfig.tokens.refresh_token,
                  expires_at: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : 0,
                },
              });
              debug('Token refreshed successfully');
              return token.access_token;
            }
          } catch (error) {
            debug('Failed to refresh token', error);
            throw new Error('Failed to refresh access token. Please log in again.');
          }
        }
        throw new Error('No valid API key, access token or refresh token available.');
      },
    };
  }
}

export class Gatana {
  public api = sdk;
  public config: GatanaConfig;
  constructor(arg?: { options?: GatanaOptions; configLoader?: ConfigLoader; isCli?: boolean }) {
    // Try to get config from file if not provided via options or env vars
    const configLoader =
      arg?.configLoader ||
      new ConfigLoader([new OptionsConfigStrategy(arg?.options), new EnvConfigStrategy(), new FileConfigStrategy()]);

    try {
      this.config = configLoader.getConfig();

      const clientConfig = {
        baseUrl: new URL('/api/v1/', this.config.baseUrl).toString(),
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
}

export { Gatana2 } from './v2.js';
