import { Command } from 'commander';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { deleteCredentialsResource } from '../../actions/resources/credentials.js';
import { deleteSandboxResource } from '../../actions/resources/sandbox.js';
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
      .argument('<id>', 'Credential ID')
      .requiredOption('-s, --server <slug>', 'Server slug')
      .action(async (id: string, options: { server: string }) => {
        if (!id) {
          console.error('Error: provide a credential ID.');
          process.exit(1);
        }
        await deleteCredentialsResource(gatana, options.server, id);
      })
  );

  cmd.addCommand(
    new Command('sandbox')
      .description('Delete a sandbox')
      .argument('<id>', 'Sandbox ID')
      .action(async (id: string) => {
        await deleteSandboxResource(gatana, id);
      })
  );

  return cmd;
}
