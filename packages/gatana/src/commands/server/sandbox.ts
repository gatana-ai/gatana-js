import { Command } from 'commander';
import { Gatana } from 'gatana-sdk';
import { sandboxShell } from '../../actions/server-mgmt/sandbox.js';

export function createSandboxCommand(gatana: Gatana): Command {
  const cmd = new Command('sandbox').description('Manage sandboxes (requires early access)');

  cmd.addCommand(
    new Command('shell')
      .description('Open an interactive SSH shell into a sandbox')
      .argument('<id>', 'Sandbox ID')
      .action(async (id: string) => {
        await sandboxShell(gatana, id);
      })
  );

  return cmd;
}
