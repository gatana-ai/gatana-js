import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { getErrorMessage, getServer } from '../../hosted.js';
import { output, outputError, outputProgress } from '../../output.js';
import { UpdateServerRequest } from '../../../lib/api/types.gen.js';

export function createUpdateCommand(gatana: Gatana): Command {
  return new Command('update')
    .description('Update swerver metadata (name, description, environment variables)')
    .argument('<serverSlug>', 'Server to update')
    .option('-n, --name <name>', 'Update name')
    .option('-d, --description <description>', 'Update description')
    .option('-E, --is-enabled <isEnabled>', 'Update enabled status (true or false)')
    .option(
      '-e, --env <key=value>',
      'Set environment variable (can be used multiple times)',
      (value, previous: Array<{ key: string; value: string }> = []) => {
        const [key, val] = value.split('=');
        if (!key || val === undefined) {
          throw new Error('Environment variables must be in format KEY=VALUE');
        }
        return [...previous, { key, value: val }];
      }
    )
    .addHelpText(
      'after',
      `
Examples:
  $ gatana hosted update my-server --name "My Updated Server"
  $ gatana hosted update my-server --description "A better description"
  $ gatana hosted update my-server --env API_KEY=secret123
  $ gatana hosted update my-server --env DB_URL=postgres://localhost --env DEBUG=true
  $ gatana hosted update my-server --name "New Name" --description "New desc" --env PORT=3000`
    )
    .action(
      async (
        serverSlug: string,
        options: {
          name?: string;
          description?: string;
          env?: Array<{ key: string; value: string }>;
          enabled?: string;
        }
      ) => {
        try {
          // Verify the function exists and get current details
          let currentServer;
          try {
            currentServer = await getServer(gatana, serverSlug);
          } catch (error) {
            outputError(`Hosted server ${serverSlug} not found`);
            process.exit(1);
          }

          // Check if any updates were provided
          if (!options.name && !options.description && !options.env) {
            outputError('No updates provided. Use --name, --description, or --env options.');
            process.exit(1);
          }

          // Prepare update payload
          const updateData: UpdateServerRequest = {
            ...(currentServer as UpdateServerRequest),
            name: currentServer.name ?? options.name,
            description: currentServer.description ?? options.description,
          };

          // Handle environment variables
          if (
            options.env &&
            (updateData.transportConfig.type === 'stdio' || updateData.transportConfig.type === 'hosted')
          ) {
            // Start with existing env vars if not clearing
            const existingEnv = updateData.transportConfig.env || [];
            const envMap = new Map(existingEnv);

            // Add/update new env vars
            options.env.forEach(({ key, value }) => {
              envMap.set(key, value);
            });

            updateData.transportConfig.env = Array.from(envMap.entries());
          }

          const { error } = await gatana.api.putMcpServersByServerSlug({
            path: { serverSlug },
            body: updateData,
          });

          if (error) {
            outputError(`Failed to update server: ${getErrorMessage(error)}`);
            process.exit(1);
          }

          // Get updated function details
          const updatedFunction = await getServer(gatana, serverSlug);

          output(updatedFunction);
        } catch (error) {
          outputError(error);
          process.exit(1);
        }
      }
    );
}
