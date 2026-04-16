import { Command } from 'commander';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { getCredentialsResource } from '../../actions/resources/credentials.js';
import { getSandboxResource } from '../../actions/resources/sandbox.js';
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
      .option('-s, --server <slug>', 'Server slug')
      .option('-e, --with-effective', 'Resolve effective credentials (e.g. using refresh token)')
      .action(async (id: string | undefined, options: { server?: string; withEffective?: boolean }) => {
        await getCredentialsResource(gatana, gatana2, options.server, id, options.withEffective);
      })
  );

  cmd.addCommand(
    new Command('sandbox')
      .alias('sandboxes')
      .description('Get sandbox(es)')
      .argument('[id]', 'Sandbox ID (omit to list all)')
      .option('--all', 'Also include archived sandboxes')
      .action(async (id?: string, options?: { all?: boolean }) => {
        await getSandboxResource(gatana, id, options?.all);
      })
  );

  return cmd;
}
