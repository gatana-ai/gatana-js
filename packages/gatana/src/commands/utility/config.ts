import { Command } from 'commander';
import {
  getDefaultOrganization,
  getOrganization,
  listOrganizations,
  OrganizationConfig,
  readConfig,
  removeOrganization,
  setDefaultOrganization,
  setOrganizationConfig,
} from 'gatana-sdk/config';
import * as openidClient from 'openid-client';
import open from 'open';
import { output } from '../../output.js';
import { ConfigLoader, Gatana } from 'gatana-sdk';

export function createConfigCommand(configLoader: ConfigLoader): Command {
  const configCommand = new Command('config').description(
    `Show configuration requirements and current status. Available configuration strategies:\n\n${configLoader.strategies.map(s => `* ` + s.help).join('\n')}`
  );

  configCommand.addCommand(
    new Command('current').description('Show resolved organization and configuration').action(() => {
      const config = configLoader.getConfig();
      output(JSON.parse(JSON.stringify(config)));
      console.log(
        'Note: This is the resolved configuration after applying all strategies (env vars, config file, etc). For more info, run with DEBUG=gatana'
      );
    })
  );

  configCommand.addCommand(
    new Command('token').description('Prints the token which would be used for any request').action(async () => {
      const config = configLoader.getConfig();
      output(await config.token());
    })
  );

  configCommand.addCommand(
    new Command('login')
      .description(`Login using PAT or OIDC authentication flow. Example: gatana login my-organization`)
      .argument('<org-id>', 'Organization ID (e.g., org123)')
      .option('-p, --pat <pat>', 'Personal Access Token (PAT) for authentication')
      .option(
        '-b, --base-url <base-url>',
        'Base URL (default: none) - experimental - hardcodes the base URL for development purposes only'
      )
      .action(async (orgId: string, options: { baseUrl?: string; pat?: string }) => {
        try {
          const baseUrl = options.baseUrl || `https://${orgId}.gatana.ai`;
          if (options.pat) {
            setOrganizationConfig(orgId, {
              baseUrl,
              pat: options.pat,
            });
          } else {
            const config = await openidClient.discovery(new URL(baseUrl), `${orgId}-cli`);

            const scope = 'openid profile email offline_access gatana.selfservice';
            const response = await openidClient.initiateDeviceAuthorization(config, { scope });

            console.log(
              `Please open ${response.verification_uri_complete || response.verification_uri} to complete the login. If required enter ${response.user_code}`
            );
            open(response.verification_uri_complete || response.verification_uri);

            const result = await openidClient.pollDeviceAuthorizationGrant(config, response);

            setOrganizationConfig(orgId, {
              baseUrl,
              tokens: {
                access_token: result.access_token,
                refresh_token: result.refresh_token!,
                expires_at: result.expires_in ? Date.now() / 1000 + result.expires_in : 0,
              },
            });
          }

          console.log('Login successful! You can now use the CLI commands.');

          setDefaultOrganization(orgId);
          console.log(`${orgId} is now the active organization.`);
        } catch (error) {
          let didPrintCause = false;
          if (error instanceof openidClient.ClientError && error.cause) {
            const cause = error.cause as any;
            if ('body' in cause && cause.body instanceof ReadableStream) {
              try {
                const reader = cause.body.getReader();
                const chunks: Uint8Array[] = [];
                let done = false;

                while (!done) {
                  const { value, done: readerDone } = await reader.read();
                  done = readerDone;
                  if (value) {
                    chunks.push(value);
                  }
                }

                const bodyText = new TextDecoder().decode(
                  new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]))
                );
                console.error('Failed with message:', bodyText);
              } catch (streamError) {
                console.error('Failed to read error body stream:', streamError);
                console.error('Caused by:', cause.body);
              } finally {
                didPrintCause = true;
              }
            }
          }
          if (!didPrintCause) {
            console.error('Error during login:', error);
          }
          process.exit(1);
        }
      })
  );

  configCommand
    .addCommand(
      new Command('ls').description('List all configured organizations').action(() => {
        const orgs = listOrganizations();
        const defaultOrgId = getDefaultOrganization();

        if (orgs.length === 0) {
          console.log('No orgs configured.');
          return;
        }

        console.log('Configured orgs:');
        orgs.forEach(organization => {
          const config = getOrganization(organization);
          const isDefault = organization === defaultOrgId;
          console.log(`  ${isDefault ? '* ' : '  '}Org ID: ${organization}`);
          if (config?.baseUrl) console.log(`    Base URL: ${config.baseUrl}`);
          if (config?.pat) console.log(`    Personal Access Token: [SAVED]`);
          if (config?.tokens?.access_token) console.log(`    Access Token: [SAVED]`);
          if (config?.tokens?.expires_at)
            console.log(`    Access Token Expiry: ${new Date(config.tokens.expires_at * 1000).toISOString()}`);
          if (config?.tokens?.refresh_token) console.log(`    Refresh Token: [SAVED]`);
          console.log('');
        });

        if (defaultOrgId) {
          console.log(`\nDefault organization: ${defaultOrgId}`);
        }
      })
    )
    .addCommand(
      new Command('set-default')
        .description('Set default organization')
        .argument('<org-id>', 'ID of the organization to set as default')
        .action((orgId: string) => {
          try {
            setDefaultOrganization(orgId);
            console.log(`✅ Set ${orgId} as default organization`);
          } catch (error) {
            console.error('❌ Error setting default organization:', (error as Error).message);
            process.exit(1);
          }
        })
    )
    .addCommand(
      new Command('remove')
        .description('Remove a organization configuration')
        .argument('<org-id>', 'ID of the organization to remove')
        .action((orgId: string) => {
          try {
            removeOrganization(orgId);
            console.log(`✅ Removed organization ${orgId}`);
          } catch (error) {
            console.error('❌ Error removing organization:', (error as Error).message);
            process.exit(1);
          }
        })
    );

  return configCommand;
}
