import { Command } from 'commander';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { getCredentialsResource } from '../../actions/resources/credentials.js';
import { getServerResource } from '../../actions/resources/server.js';
import { getToolResource } from '../../actions/resources/tool.js';

export function createGetCommand(gatana: Gatana, gatana2: Gatana2): Command {
  const cmd = new Command('get').description('Display one or many resources');

  cmd.addCommand(
    new Command('server')
      .alias('servers')
      .description('Get server(s)')
      .argument('[name]', 'Server slug (omit to list all)')
      .action(async (name?: string) => {
        await getServerResource(gatana, gatana2, name);
      })
  );

  cmd.addCommand(
    new Command('tool')
      .alias('tools')
      .description('Get tool(s)')
      .argument('[name]', 'Tool name (omit to list all). Use "gatana tool <name>" to call the tool')
      .option('--enabled', 'Only show enabled tools')
      .action(async (name?: string, options?: { enabled?: boolean }) => {
        await getToolResource(gatana, name, options?.enabled);
      })
  );

  cmd.addCommand(
    new Command('creds')
      .alias('credentials')
      .description('Get credentials for a server')
      .argument('[id]', 'Credential ID (omit to list all)')
      .requiredOption('-s, --server <slug>', 'Server slug')
      .action(async (id: string | undefined, options: { server: string }) => {
        await getCredentialsResource(gatana, options.server, id);
      })
  );

  return cmd;
}
