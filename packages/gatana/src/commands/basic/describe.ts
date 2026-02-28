import { Command } from 'commander';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { describeServerResource } from '../../actions/resources/server.js';

export function createDescribeCommand(gatana: Gatana, gatana2: Gatana2): Command {
  const cmd = new Command('describe').description('Show details of a specific resource');

  cmd.addCommand(
    new Command('server')
      .description('Show server deployment status and tools')
      .argument('<name>', 'Server slug')
      .action(async (name: string) => {
        await describeServerResource(gatana, gatana2, name);
      })
  );

  return cmd;
}
