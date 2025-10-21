import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { showDeploymentProgress, fetchCrashLogs, getErrorMessage } from '../../hosted.js';
import { output, outputError } from '../../output.js';

export function createShowCommand(gatana: Gatana): Command {
  return new Command('show')
    .description('Show server deployment and their tools')
    .argument('<serverSlug>', 'Server ID to retrieve')
    .action(async (serverSlug: string) => {
      const result = await showDeploymentProgress(gatana, serverSlug, false);
      if (result.stabilized && result.podName) {
        const tools = await gatana.api.getMcpServersByServerSlugTools({ path: { serverSlug } });
        if (tools.error) {
          outputError(`Failed to validate tools: ${getErrorMessage(tools.error)}`);
          process.exit(1);
        }

        output(tools.data);
      } else if (!result.stabilized && result.podName) {
        // get logs
        if (result.podName) {
          const logs = await fetchCrashLogs(gatana, result.podName);
          if (logs) {
            output(logs.stdout);
            output(logs.stderr);
          }
        }
      }
      process.exit(0);
    });
}
