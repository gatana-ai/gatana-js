import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { Gatana2 } from '../../../lib/v2.js';
import { deleteCredentialsResource } from '../../actions/resources/credentials.js';
import { deleteServerResource } from '../../actions/resources/server.js';

export function createDeleteCommand(gatana: Gatana, gatana2: Gatana2): Command {
  const cmd = new Command('delete').description('Delete resources');

  cmd.addCommand(
    new Command('server')
      .description('Delete a server')
      .argument('<name>', 'Server slug')
      .action(async (name: string) => {
        await deleteServerResource(gatana, gatana2, name);
      })
  );

  cmd.addCommand(
    new Command('credentials')
      .alias('creds')
      .description('Delete credentials for a server')
      .argument('[id]', 'Credential ID (required unless --all is used)')
      .requiredOption('-s, --server <slug>', 'Server slug')
      .option('--all', 'Delete all credentials for the server')
      .action(async (id: string | undefined, options: { server: string; all?: boolean }) => {
        if (!id && !options.all) {
          console.error('Error: provide a credential ID or use --all to delete all credentials.');
          process.exit(1);
        }
        await deleteCredentialsResource(gatana, options.server, options.all ? undefined : id);
      })
  );

  return cmd;
}
