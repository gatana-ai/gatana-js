import { Command } from 'commander';
import { ConfigLoader, Gatana } from '../../../lib/index.js';
import {
  promptForNewFunction,
  checkIndexJsExists,
  createZipFromDirectory,
  createHostedServer,
  uploadZipToFunction,
  startServer,
  showDeploymentProgress,
  cleanupZipFile,
  fetchCrashLogs,
  getErrorMessage,
} from '../../hosted.js';
import { output, outputError, outputInfo, outputProgress } from '../../output.js';
import { getDeploymentsStatus } from '../../../lib/api/sdk.gen.js';

export function createDeployCommand(gatana: Gatana): Command {
  return new Command('deploy-hosted-server')
    .description('Deploy hosted server (new or existing)')
    .argument('[path]', 'Root directory path for deployment (default: current directory)', process.cwd())
    .option('-i, --id <id>', 'Server slug (if not provided, will create new)')
    .option('--no-progress', 'Skip deployment progress monitoring')
    .option('--no-logs', 'Skip fetching crash logs on deployment failure')
    .action(async (path: string, options: { id?: string; progress: boolean; logs: boolean }) => {
      let zipPath = '';
      try {
        let serverSlug = options.id;

        // Use the positional argument for deployment path
        const deploymentPath = path;

        // Step 1: Handle function ID (create new if not provided)
        if (!serverSlug) {
          const { create, name } = await promptForNewFunction();
          if (!create) {
            outputInfo('Deployment cancelled.');
            process.exit(0);
          }

          outputInfo(`Creating new hosted server: ${name}`);
          const serverInfo = await createHostedServer(gatana, name!);
          serverSlug = serverInfo.slug;
          outputInfo(`Created hosted server with ID: ${serverSlug}`);
        }

        const indexCheck = checkIndexJsExists(deploymentPath);
        if (!indexCheck.exists) {
          outputError(
            `index.js file not found in directory: ${deploymentPath}. Make sure the directory contains an index.js file.`
          );
          return;
        }

        if (!indexCheck.hasSchema) {
          outputInfo(
            `Warning: index.js does not contain a schema export.` +
              `Make sure your file exports a schema: ` +
              `• ES modules: export const schema = { ... }` +
              `• CommonJS: module.exports.schema = { ... }` +
              `Proceeding anyway...`
          );
        }

        // Step 3: Create ZIP package
        outputInfo('Creating deployment package...');
        zipPath = await createZipFromDirectory(deploymentPath);

        // Step 4: Upload ZIP
        outputInfo('Deploying...');
        await uploadZipToFunction(gatana, serverSlug, zipPath);
        await startServer(gatana, serverSlug);

        // Step 5: Show deployment progress (if not disabled)
        if (options.progress) {
          const result = await showDeploymentProgress(gatana, serverSlug, false);
          output({
            deployed: result.deployed,
            stabilized: result.stabilized,
          });

          // Print logs unless --no-logs and if deployment failed
          if (options.logs && !result.stabilized) {
            try {
              let podName = result.podName;
              if (!podName) {
                // Fallback: get podName from deployment status
                const state = await getDeploymentsStatus({ query: { hostedFunctionId: serverSlug } });
                const deployments = state.data?.deployments || [];
                podName = deployments.length > 0 ? deployments[0].name : undefined;
              }

              if (podName) {
                const crashLogs = await fetchCrashLogs(gatana, podName);
                if (crashLogs) {
                  output(crashLogs.stdout);
                }
              }
            } catch (logError) {
              outputError(`Failed to fetch crash logs: ${logError}`);
            }
          }

          // Exit with error code if deployment failed
          if (!result.stabilized) {
            process.exit(1);
          }

          // If stabilized, call endpoint to get tools for final validation
          const tools = await gatana.api.getMcpServersByServerSlugTools({ path: { serverSlug } });
          if (tools.error) {
            outputError(`Failed to validate tools: ${getErrorMessage(tools.error)}`);
            process.exit(1);
          }

          output(tools.data);
        } else {
          output({
            deployed: true,
            stabilized: 'unknown',
          });
        }
        process.exit(0);
      } catch (error) {
        outputError(error);
      } finally {
        if (zipPath) {
          // Step 6: Cleanup even on failure
          cleanupZipFile(zipPath).catch(err => outputError(`Error cleaning up temp file: ${err}`));
        }
      }
    });
}
