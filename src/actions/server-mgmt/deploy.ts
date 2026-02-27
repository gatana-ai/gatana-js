import { getDeploymentsStatus } from '../../../lib/api/sdk.gen.js';
import { Gatana } from '../../../lib/index.js';
import { outputError, output, outputInfo, outputSuccess } from '../../output.js';
import { getErrorMessage, fetchCrashLogs, waitForDeploymentDone } from './hosted.js';

/**
 * Get the deployment status of a server.
 * `gatana deploy get <slug>`
 */
export async function getDeploymentStatus(gatana: Gatana, serverSlug: string): Promise<void> {
  try {
    const state = await getDeploymentsStatus({ query: { serverSlug } });

    if (state.error) {
      outputError(`Failed to get deployment status: ${getErrorMessage(state.error)}`);
      process.exit(1);
    }

    output(state.data);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Get the logs of a running server deployment.
 * `gatana deploy logs <slug> [--id <deploymentId>]`
 */
export async function getDeploymentLogs(gatana: Gatana, serverSlug: string, options: { id?: string }): Promise<void> {
  try {
    const state = await getDeploymentsStatus({ query: { serverSlug } });
    const deployments = state.data?.deployments || [];

    if (deployments.length === 0) {
      outputInfo('No deployments found.');
      return;
    }

    // Use the specified deployment ID or fall back to the latest
    let podName: string | undefined;
    if (options.id) {
      const match = deployments.find(d => d.name === options.id);
      if (!match) {
        outputError(`Deployment '${options.id}' not found. Available: ${deployments.map(d => d.name).join(', ')}`);
        process.exit(1);
      }
      podName = match.name;
    } else {
      podName = deployments[0].name;
    }

    if (!podName) {
      outputInfo('No pod found for this deployment.');
      return;
    }

    const logs = await fetchCrashLogs(gatana, podName);
    if (logs) {
      if (logs.stdout) output(logs.stdout);
      if (logs.stderr) output(logs.stderr);
    } else {
      outputInfo('No logs available.');
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Turn off a server.
 * `gatana deploy off <slug>`
 */
export async function turnOffServer(gatana: Gatana, serverSlug: string): Promise<void> {
  try {
    const { error } = await gatana.api.postMcpServersByServerSlugStop({
      path: { serverSlug },
    });

    if (error) {
      outputError(`Failed to stop server: ${getErrorMessage(error)}`);
      process.exit(1);
    }

    outputSuccess(`Server '${serverSlug}' stopped.`);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Turn on a server.
 * `gatana deploy start <slug> [--wait]`
 */
export async function turnOnServer(gatana: Gatana, serverSlug: string, options: { wait?: boolean }): Promise<void> {
  try {
    const { data, error } = await gatana.api.postMcpServersByServerSlugStart({
      path: { serverSlug },
    });

    if (error) {
      outputError(`Failed to start server: ${getErrorMessage(error)}`);
      process.exit(1);
    }

    if (data && !data.success) {
      outputError(`Failed to start server: ${data.detail ?? 'unknown reason'}`);
      process.exit(1);
    }

    if (!options.wait) {
      outputSuccess(`Server '${serverSlug}' started.`);
      return;
    }

    const result = await waitForDeploymentDone(gatana, serverSlug);
    output({
      deployed: result.deployed,
      stabilized: result.stabilized,
    });

    if (!result.stabilized) {
      if (result.podName) {
        const crashLogs = await fetchCrashLogs(gatana, result.podName);
        if (crashLogs?.stdout) output(crashLogs.stdout);
        if (crashLogs?.stderr) output(crashLogs.stderr);
      }
      process.exit(1);
    }

    outputSuccess(`Server '${serverSlug}' started and stabilized.`);
  } catch (error) {
    outputError(error);
  }
}
