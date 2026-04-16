import { Command } from 'commander';
import { Gatana } from 'gatana-sdk';
import { output, outputError } from '../../output.js';

export function createCredsCommand(gatana: Gatana): Command {
  return new Command('creds')
    .description('Gets the effective credentials for a server')
    .argument('<serverSlug>', 'Server slug')
    .option(
      '--cred-id <id>',
      'ID of a specific credential to retrieve the token for. If omitted, the effective credentials for the current user are resolved automatically.'
    )
    .action(async (serverSlug: string, options: { credId?: string }) => {
      try {
        const { data } = await gatana.api.getMcpServersByServerSlugCredentialsToken({
          path: { serverSlug },
          query: { credentialsId: options.credId },
        });

        output(data.accessToken || Object.fromEntries(data.apikeys || []), { defaultFormat: 'yaml' });
      } catch (err) {
        outputError(err);
      }
    });
}
