import { Gatana, Gatana2 } from 'gatana-sdk';
import { ServerCredentialsDto, getAuditLogs, getDeploymentsStatus } from 'gatana-sdk/api';
import { getServersBySlug } from 'gatana-sdk/apiv2';
import {
  getErrorMessage,
  createServer,
  createZipFromDirectory,
  uploadZipToFunction,
  startServer,
  cleanupZipFile,
  localVerifySourceCode,
  waitForDeploymentDone,
} from '../server-mgmt/hosted.js';
import { EventSource } from 'eventsource';
import { output, outputError, outputInfo, outputSuccess, TableColumn } from '../../output.js';
import { input } from '@inquirer/prompts';
import { formatAge } from '../../utils/utils.js';
import _ from 'lodash';

// Table columns used for listing servers
const serverTableColumns: TableColumn[] = [
  { name: 'slug', title: 'Slug', alignment: 'left' },
  { name: 'isEnabled', title: 'Enabled', alignment: 'center' },
  { name: 'transportConfig.type', title: 'Type', alignment: 'center' },
  { title: 'Last Updated', valueGet: row => formatAge(row.updatedAt) },
  { title: 'Age', valueGet: row => formatAge(row.createdAt) },
];

/**
 * List all servers, or get a single server by slug.
 * `gatana get server [name]`
 */
export async function getServerResource(gatana: Gatana, gatana2: Gatana2, slug?: string): Promise<void> {
  try {
    if (slug) {
      const { data: server } = await getServersBySlug({ path: { slug } });
      output(server, { defaultFormat: 'yaml' });
    } else {
      const { data } = await gatana2.api.getServers();
      output({ servers: data?.servers || [] }, { tableColumns: serverTableColumns, defaultFormat: 'table' });
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Detailed view of a server — deployment status + tools.
 * `gatana describe server <slug>`
 */
export async function describeServerResource(gatana: Gatana, gatana2: Gatana2, slug: string): Promise<void> {
  try {
    const { data: server } = await getServersBySlug({ path: { slug } });
    if (!server) {
      outputError(`Server '${slug}' not found.`);
      return;
    }
    const { data: logsFull } = await getAuditLogs({
      query: { entityTypes: ['mcp_server', 'mcp'], limit: '5', entityId: server.id.toString() },
    });
    const { data: credentialsFull } = await gatana.api.getMcpServersByServerSlugCredentials({
      path: { serverSlug: slug },
      query: { all: 'true' },
    });
    const logs = logsFull?.data.map(x => ({
      eventName: x.eventName,
      age: formatAge(x.createdAt),
      tool: x.eventName === 'tools/call' ? _.get(x, 'details.toolName', 'n/a') : undefined,
    }));
    const credentials = credentialsFull?.credentials.map((c: ServerCredentialsDto) => ({
      id: c.id,
      scope: c.scope,
      owner: c.scope === 'server' ? '<self>' : (c.profileName ?? c.userEmail ?? '<unknown>'),
    }));
    output({ server, logsTop5: logs || [], credentials: credentials || [] }, { defaultFormat: 'yaml' });
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a new hosted server.
 * `gatana create server`
 */
export type TransportType = 'hosted' | 'stdio' | 'httpstreaming' | 'sse';
export async function createServerResource(
  gatana: Gatana,
  gatana2: Gatana2,
  options: { name?: string; transportType?: TransportType }
): Promise<void> {
  try {
    let serverName = options.name;
    if (!serverName) {
      serverName = await input({
        message: 'Enter the name for the new hosted server:',
        validate: val => {
          if (!val.trim()) return 'Server name is required';
          if (val.length < 3) return 'Server name must be at least 3 characters long';
          return true;
        },
      });
    }
    let transportType = options.transportType;
    if (!transportType) {
      transportType = (await input({
        message: 'Select the transport type for the server (httpstreaming, sse, stdio, hosted):',
        validate: val => {
          const validTypes = ['hosted', 'stdio', 'httpstreaming', 'sse'];
          if (!validTypes.includes(val)) {
            return `Invalid transport type. Valid options are: ${validTypes.join(', ')}`;
          }
          return true;
        },
      })) as TransportType;
    }

    const serverInfo = await createServer(gatana, serverName, transportType);

    outputSuccess(`Created server ${serverInfo.slug}`);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a server by slug.
 * `gatana delete server <slug>`
 */
export async function deleteServerResource(gatana: Gatana, gatana2: Gatana2, serverSlug: string): Promise<void> {
  try {
    const { error } = await gatana.api.deleteMcpServersByServerSlug({
      path: { serverSlug },
    });

    if (error) {
      outputError(`Failed to delete server: ${getErrorMessage(error)}`);
      process.exit(1);
    }

    outputSuccess(`Server '${serverSlug}' deleted successfully.`);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Deploy a hosted server.
 * `gatana deploy server <slug> [path]`
 */
export async function deployServerResource(
  gatana: Gatana,
  serverSlug: string | undefined,
  deploymentPath: string,
  options: { noWait: boolean; force: boolean; create: boolean; noLogs: boolean }
): Promise<void> {
  let zipPath = '';
  try {
    let slug = serverSlug;

    if (!slug) {
      throw new Error('Server slug is required for deployment. Please provide a slug using the --id option.');
    }

    outputInfo('Verifying deployment package...');
    try {
      await localVerifySourceCode(deploymentPath);
    } catch {
      if (!options.force) {
        outputError('Source code verification failed. Use --force to proceed with deployment anyway.');
        return;
      } else {
        outputInfo('Source code verification failed, but proceeding due to --force flag.');
      }
    }

    outputInfo('Creating deployment package...');
    zipPath = await createZipFromDirectory(deploymentPath);

    const server = await getServersBySlug({ path: { slug } });
    if (!server.data) {
      if (options.create) {
        outputInfo(`Server '${slug}' not found. Creating new server...`);
        await createServer(gatana, slug, 'hosted');
      } else {
        outputError(`Server '${slug}' not found. Use --create to create a new server if it does not exist.`);
        process.exit(1);
      }
    }

    outputInfo('Deploying...');
    await uploadZipToFunction(gatana, slug, zipPath);
    await startServer(gatana, slug);

    if (options.noWait) {
      outputSuccess(`Deployment started. You can use "gatana deploy wait ${slug}" to wait for deployment to finish.`);
      process.exit(0);
    } else {
      await waitForDeploymentDone(gatana, slug);
    }
  } catch (error) {
    outputError(error);
  } finally {
    if (zipPath) {
      cleanupZipFile(zipPath).catch(err => outputError(`Error cleaning up temp file: ${err}`));
    }
  }
}

/**
 * Show deployment logs for a server.
 * `gatana logs server <slug>`
 */
export async function getServerLogs(
  gatana: Gatana,
  serverSlug: string,
  options: { follow?: boolean; previous?: boolean; id?: string }
) {
  const state = await getDeploymentsStatus({ query: { serverSlug } });
  const deployments = state.data?.deployments || [];
  const previous = options.previous || false;
  const follow = options.follow || false;
  const deploymentId = options.id;

  if (deployments.length === 0) {
    outputInfo('No deployments found.');
    return;
  }

  const podName = deploymentId ? deployments.find(d => d.name === deploymentId)?.name : deployments[0].name;
  if (!podName) {
    outputInfo('No deployments found.');
    return;
  }

  if (!follow) {
    const logs = await gatana.api.getDeploymentsLogs({
      query: {
        podName,
        previous: previous ? 'true' : 'false',
      },
      headers: { accept: 'application/json' },
    });
    if (logs.error || !logs.data) {
      outputError(logs.error || 'Failed to fetch logs');
      return;
    }
    const logData = logs.data;
    console.log(logData.logs.stdout); // stderr is included in stdout by the backend
  } else {
    // Use EventSource to follow logs in real-time
    const eventSourceUrl = new URL(
      `/api/v1/deployments/logs?podName=${encodeURIComponent(podName)}&previous=${previous ? 'true' : 'false'}`,
      gatana.config.baseUrl
    );

    const eventSource = new EventSource(eventSourceUrl, {
      fetch: async (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${await gatana.config.token()}`,
          },
        }),
    });

    const handle = (event: MessageEvent) => {
      const newLog = JSON.parse(event.data) as { line: string };
      console.log(newLog.line);
    };
    eventSource.addEventListener('stdout', handle);
    eventSource.addEventListener('stderr', handle);

    eventSource.onerror = (error: any) => {
      outputError(getErrorMessage(error));
      eventSource.close();
    };
  }
}
