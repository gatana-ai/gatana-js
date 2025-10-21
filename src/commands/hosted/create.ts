import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { createHostedServer } from '../../hosted.js';
import { outputError, outputSuccess } from '../../output.js';
import { input } from '@inquirer/prompts';

export function createCreateCommand(gatana: Gatana): Command {
  return new Command('create-hosted-server')
    .description('Create a new hosted server (without deploying)')
    .option('-n, --name <name>', 'Server name')
    .option('-d, --description <description>', 'Server description')
    .action(async (options: { name?: string; description?: string }) => {
      try {
        let serverName = options.name;
        if (!serverName) {
          serverName = await input({
            message: 'Enter the name for the new hosted server:',
            validate: input => {
              if (!input.trim()) {
                return 'Server name is required';
              }
              if (input.length < 3) {
                return 'Server name must be at least 3 characters long';
              }
              return true;
            },
          });
        }

        const serverInfo = await createHostedServer(gatana, serverName, options.description);

        outputSuccess('Hosted server created successfully!', {
          serverSlug: serverInfo.slug,
          serverName: serverInfo.name,
          nextSteps: [
            'Prepare your server code with an index.js file',
            'Make sure your index.js exports a schema (export const schema or module.exports.schema)',
            `Deploy your server: gatana hosted deploy --id ${serverInfo.slug} [path]`,
          ],
        });
      } catch (error) {
        outputError(error);
      }
    });
}
