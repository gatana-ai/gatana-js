import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { fromAge } from '../../utils/utils.js';
import {
  getDeploymentStatus,
  getDeploymentLogs,
  turnOffServer,
  turnOnServer,
} from '../../actions/server-mgmt/deploy.js';
import { waitForDeploymentDone } from '../../actions/server-mgmt/hosted.js';
import { getServerLogs } from '../../actions/resources/server.js';

export function createDeployCommand(gatana: Gatana): Command {
  const cmd = new Command('deployment').alias('deploy').description('Manage server deployments (stdio and hosted)');

  cmd.addCommand(
    new Command('get')
      .description('Gets the deployment status of a server.')
      .argument('<name>', 'Server slug')
      .action(async (name: string) => {
        await getDeploymentStatus(gatana, name);
      })
  );

  cmd.addCommand(
    new Command('logs')
      .description('Show logs for a server (for stdio and hosted servers)')
      .argument('<name>', 'Server slug')
      .option('-f, --follow', 'Follow log output')
      .option('-p, --previous', 'Show previous logs instead of current logs (useful if the server keeps restarting)')
      .option('--id <deploymentId>', 'Deployment ID to get logs for (defaults to latest)')
      .action(async (name: string, options: { follow?: boolean; previous?: boolean; id?: string }) => {
        await getServerLogs(gatana, name, options);
      })
  );

  cmd.addCommand(
    new Command('wait')
      .description('Wait for deployment to finish')
      .argument('<name>', 'Server slug')
      .option(
        '--timeout <1m3s>',
        `The length of time to wait before giving up. Zero means check once and don't wait`,
        '10m'
      )
      .action(async (name: string, options: { timeout: string }) => {
        const timeoutMs = fromAge(options.timeout) || 10 * 60 * 1000;
        await waitForDeploymentDone(gatana, name, timeoutMs);
      })
  );

  cmd.addCommand(
    new Command('stop')
      .description(
        'Stops a servers deployment. Unless disabled, Gatana will start it automatically again if a tool call comes in'
      )
      .argument('<name>', 'Server slug')
      .action(async (name: string) => {
        await turnOffServer(gatana, name);
      })
  );

  cmd.addCommand(
    new Command('start')
      .description(`Starts a server's deployment.`)
      .argument('<name>', 'Server slug')
      .option('--wait', 'Wait for deployment to finish before returning')
      .action(async (name: string, options: { wait?: boolean }) => {
        await turnOnServer(gatana, name, options);
      })
  );

  return cmd;
}
