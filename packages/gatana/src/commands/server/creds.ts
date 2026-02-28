import { Command } from 'commander';
import { Gatana } from 'gatana-sdk';
import { output, outputError } from '../../output.js';

export function createCredsCommand(gatana: Gatana): Command {
  return new Command('creds')
    .description('Gets the effective credentials for a server')
    .argument('<serverSlug>', 'Server slug')
    .option('--cred-id <id>', 'Credential ID (omit to use your effective credentials)')
    .action(async (serverSlug: string, options: { credId?: string }) => {
      try {
        const { data, error } = await gatana.api.getMcpServersByServerSlugCredentialsToken({
          path: { serverSlug },
          query: { credentialsId: options.credId },
        });

        if (error) {
          outputError(error);
          return;
        }

        output(data?.accessToken || Object.fromEntries(data?.apikeys || []), { defaultFormat: 'yaml' });
      } catch (err) {
        outputError(err);
      }
    });
}
