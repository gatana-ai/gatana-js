import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { output } from '../../output.js';
import { getDeploymentsStatus } from '../../../lib/api/sdk.gen.js';
import { getServer } from '../../hosted.js';

export function createGetCommand(gatana: Gatana): Command {
  return new Command('get')
    .description('Get server details and show deployment logs')
    .argument('<serverSlug>', 'ID to retrieve')
    .action(async (serverSlug: string) => {
      // Get the server details
      const server = await getServer(gatana, serverSlug);
      const state = await getDeploymentsStatus({ query: { serverSlug } });

      output({ ...server, ...state.data });
    });
}
