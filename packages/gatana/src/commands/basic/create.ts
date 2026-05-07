import { Command, Option } from 'commander';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { createCredentialsResource } from '../../actions/resources/credentials.js';
import { createSandboxResource } from '../../actions/resources/sandbox.js';
import { createServerResource } from '../../actions/resources/server.js';

export function createCreateCommand(gatana: Gatana, gatana2: Gatana2): Command {
  const cmd = new Command('create').description('Create a resource');

  cmd.addCommand(
    new Command('server')
      .description('Create a new hosted server')
      .option('-s, --slug <slug>', 'Server slug')
      .addOption(
        new Option('-t, --transport-type <type>', 'Transport type').choices(['hosted', 'stdio', 'httpstreaming', 'sse'])
      )
      .action(async (options: { slug?: string; transportType?: 'hosted' | 'stdio' | 'httpstreaming' | 'sse' }) => {
        await createServerResource(gatana, gatana2, options);
      })
  );

  cmd.addCommand(
    new Command('credentials')
      .alias('creds')
      .description(
        'Create or replace credentials for a server. The credential type (oauth/apikey) is inferred from the server config. ' +
          'For OAuth, omit -f to get an authorize URL, or provide -f to file upload a token-set, or use stdin as JSON. ' +
          'For API keys, provide keys via -f or stdin as JSON: [["header","value"], …]'
      )
      .argument('<serverSlug>', 'Server slug')
      .option('-f, --file <path>', 'JSON file with credentials')
      .addOption(
        new Option(
          '--scope <scope>',
          'Credential scope. If omitted will default to servers default credential scope'
        ).choices(['user', 'server'])
      )
      .action(async (serverSlug: string, options: { file?: string; scope?: 'user' | 'server' }) => {
        await createCredentialsResource(gatana, serverSlug, options.file, options.scope);
      })
      .showHelpAfterError(true)
  );

  cmd.addCommand(
    new Command('sandbox').description('Create a new sandbox').action(async () => {
      await createSandboxResource(gatana);
    })
  );

  return cmd;
}
