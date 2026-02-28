import { confirm, input } from '@inquirer/prompts';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Gatana } from '../../../lib/index.js';
import { DeploymentLogPayload, ServerDto } from '../../../lib/api/types.gen.js';
import { EventSource } from 'eventsource';
import { clearLines, output, outputError, outputInfo } from '../../output.js';
import createDebug from 'debug';
import { dirname, resolve } from 'node:path';
import { cp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import z from 'zod';
import _ from 'lodash';

const debug = createDebug('gatana:http');
const _require = createRequire(import.meta.url);

export interface HostedServerInfo {
  name: string;
  slug: string;
}

export interface HostedFunctionListItem {
  id: string;
  name: string;
  age: string;
  isEnabled: boolean;
}

/**
 * Helper function to convert error objects to readable error messages
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    // Check for common error properties
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    // Try to extract useful information from the error object
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export async function promptForNewFunction(): Promise<{ create: boolean; name?: string }> {
  const create = await confirm({
    message: 'No server ID provided. Would you like to create a new hosted server?',
    default: true,
  });

  if (!create) {
    return { create: false };
  }

  const name = await input({
    message: 'Enter the name for the new server:',
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

  return { create: true, name: name.trim() };
}

export function checkIndexJsExists(currentDir: string = process.cwd()): {
  exists: boolean;
  hasSchema: boolean;
  error?: string;
} {
  const indexPath = join(currentDir, 'index.js');

  if (!existsSync(indexPath)) {
    return { exists: false, hasSchema: false, error: 'index.js file not found' };
  }

  try {
    const content = readFileSync(indexPath, 'utf8');

    // Check for schema export patterns
    const hasEsModuleSchema = /export\s+const\s+schema\s*=/i.test(content);
    const hasCommonJsSchema = /module\.exports\.schema\s*=/i.test(content);
    const hasSchema = hasEsModuleSchema || hasCommonJsSchema;

    return {
      exists: true,
      hasSchema,
      error: hasSchema
        ? undefined
        : 'index.js must export a schema (either "export const schema" or "module.exports.schema")',
    };
  } catch (error) {
    return {
      exists: true,
      hasSchema: false,
      error: `Failed to read index.js: ${getErrorMessage(error)}`,
    };
  }
}

export async function createZipFromDirectory(sourceDir: string = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const zipFileName = `hosted-function-${randomUUID()}.zip`;
    const zipPath = join(tmpdir(), zipFileName);

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      resolve(zipPath);
    });

    archive.on('error', err => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files from the current directory, excluding common ignore patterns
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['.git/**', '.gitignore', '*.zip', '.DS_Store', 'Thumbs.db'],
    });

    archive.finalize();
  });
}

export async function createServer(
  gatana: Gatana,
  slug: string,
  transportType: 'hosted' | 'stdio' | 'httpstreaming' | 'sse'
): Promise<HostedServerInfo> {
  const { data, error } = await gatana.api.postMcpServers({
    body: {
      slug: slug.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      transportType,
    },
  });

  if (error) {
    throw new Error(`Failed to create hosted server: ${getErrorMessage(error)}`);
  }

  if (!data?.server) {
    throw new Error('Failed to create hosted server: No server data returned');
  }

  return {
    name: data.server.name,
    slug: data.server.slug,
  };
}

export async function uploadZipToFunction(gatana: Gatana, serverSlug: string, zipPath: string): Promise<void> {
  // Read the zip file as a buffer
  const fs = await import('fs/promises');
  const fileBuffer = await fs.readFile(zipPath);

  // Create a FormData object
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), 'function.zip');

  const uploadUrl = `${gatana.config.baseUrl}/api/v1/mcp-servers/${serverSlug}/source-code`;
  debug(`→ PUT ${uploadUrl}`);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${await gatana.config.token()}`,
    },
    body: formData,
  });

  debug(`← ${uploadResponse.status} ${uploadResponse.statusText} PUT ${uploadUrl}`);

  if (!uploadResponse.ok || uploadResponse.status !== 200) {
    let errorBody: string;
    try {
      errorBody = await uploadResponse.text();
    } catch {
      errorBody = `HTTP ${uploadResponse.status} ${uploadResponse.statusText}`;
    }
    throw new Error(`Failed to upload ZIP file (${uploadResponse.status}): ${errorBody}`);
  }
}

export async function startServer(gatana: Gatana, serverSlug: string): Promise<void> {
  const { error } = await gatana.api.postMcpServersByServerSlugStart({
    path: { serverSlug },
  });

  if (error) {
    throw new Error(`Failed to start server: ${getErrorMessage(error)}`);
  }
}

export async function downloadSourceCode(
  gatana: Gatana,
  serverSlug: string,
  options: { output?: string }
): Promise<void> {
  const fs = await import('fs/promises');
  const { resolve } = await import('path');

  const downloadUrl = `${gatana.config.baseUrl}/api/v1/mcp-servers/${serverSlug}/source-code`;
  debug(`→ GET ${downloadUrl}`);

  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${await gatana.config.token()}`,
    },
  });

  debug(`← ${response.status} ${response.statusText} GET ${downloadUrl}`);

  if (!response.ok) {
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = `HTTP ${response.status} ${response.statusText}`;
    }
    throw new Error(`Failed to download source code (${response.status}): ${errorBody}`);
  }

  const outputPath = resolve(options.output ?? `${serverSlug}.zip`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  outputInfo(`Downloaded source code to ${outputPath}`);
}

export async function fetchCrashLogs(
  gatana: Gatana,
  podName: string
): Promise<{ stdout: string; stderr: string } | null> {
  const maxRetries = 50; // 50 retries * 100ms = 5 seconds max
  let retryCount = 0;

  const attemptFetch = async (): Promise<{ stdout: string; stderr: string } | null> => {
    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      const { data, error } = await gatana.api.getDeploymentsLogs({
        query: { podName, previous: 'true' },
      });

      if (error) {
        console.error(`Failed to fetch crash logs: ${getErrorMessage(error)}`);
        return null;
      }

      if (data && data.logs) {
        const { stdout, stderr } = data.logs;

        // If stdout is empty and we haven't exceeded max retries, wait and try again
        if (!stdout && retryCount < maxRetries) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 200));
          return attemptFetch();
        }

        return { stdout, stderr };
      }

      return null;
    } catch (error) {
      console.error(`Error fetching crash logs: ${getErrorMessage(error)}`);
      return null;
    }
  };

  return attemptFetch();
}

type ContainerStatus = 'pending' | 'running' | 'completed' | 'failed' | 'ready' | 'crashBackOff';

interface ContainerState {
  name: string;
  type: 'init' | 'main';
  status: ContainerStatus;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  reason?: string;
  restarts?: number;
}

interface DeploymentState {
  podInfo?: {
    createdAt: string;
    pod: string;
    initContainers: string[];
    containers: string[];
  };
  containers: Record<string, ContainerState>;
  errors: string[];
  isComplete: boolean;
  isReady: boolean;
  hasCrashed: boolean;
}

export function waitForDeploymentDone(
  gatana: Gatana,
  functionId: string,
  timeoutInMs = 10 * 60 * 1000
): Promise<{
  deployed: boolean;
  stabilized: boolean;
  podName?: string;
}> {
  return new Promise((resolve, reject) => {
    const deploymentState: DeploymentState = {
      containers: {},
      errors: [],
      isComplete: false,
      isReady: false,
      hasCrashed: false,
    };

    // Create EventSource URL with query parameter
    const eventSourceUrl = `${gatana.config.baseUrl}/api/v1/deployments/deployment-logs?serverSlug=${functionId}`;

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

    let lastLog: Record<string, any> = {};
    let firstLog = true;
    const printCurrentState = () => {
      let toLog: Record<string, any> = {};
      if (deploymentState.podInfo) {
        toLog.deploymentId = deploymentState.podInfo.pod;
        const containers = [...deploymentState.podInfo.initContainers, ...deploymentState.podInfo.containers];
        for (const name of containers) {
          toLog[name] = deploymentState.containers[name]?.status || 'pending';
        }
      }

      if (deploymentState.errors.length > 0) {
        toLog['errors'] = deploymentState.errors.join(', ');
      }

      if (!_.isEqual(toLog, lastLog)) {
        output([toLog], { defaultFormat: 'table', noHeaders: !firstLog });
        firstLog = false;
      }

      lastLog = toLog;
    };

    // Timeout
    const timeout = setTimeout(() => {
      if (!deploymentState.isComplete) {
        eventSource.close();
        resolve({
          deployed: false,
          stabilized: false,
          podName: deploymentState.podInfo?.pod,
        });
      }
    }, timeoutInMs);

    eventSource.addEventListener('DeploymentLogPayload', (event: any) => {
      try {
        const newLog = JSON.parse(event.data) as DeploymentLogPayload;
        if (newLog.type === 'done') {
          deploymentState.isComplete = true;
          eventSource.close();
          printCurrentState();

          // Check if deployment crashed before resolving
          if (deploymentState.hasCrashed) {
            clearTimeout(timeout);
            resolve({
              deployed: true,
              stabilized: false,
              podName: deploymentState.podInfo?.pod,
            });
          } else {
            clearTimeout(timeout);
            resolve({
              deployed: true,
              stabilized: true,
              podName: deploymentState.podInfo?.pod,
            });
          }
          return;
        }

        // Update deployment state based on log type
        switch (newLog.type) {
          case 'podInfo':
            deploymentState.podInfo = {
              createdAt: newLog.createdAt,
              pod: newLog.pod,
              initContainers: newLog.initContainers,
              containers: newLog.containers,
            };

            // Initialize all containers as pending
            newLog.initContainers.forEach(name => {
              deploymentState.containers[name] = {
                name,
                type: 'init',
                status: 'pending',
              };
            });

            newLog.containers.forEach(name => {
              deploymentState.containers[name] = {
                name,
                type: 'main',
                status: 'pending',
              };
            });
            break;

          case 'initContainerRunning':
            if (deploymentState.containers[newLog.name]) {
              deploymentState.containers[newLog.name] = {
                ...deploymentState.containers[newLog.name],
                status: 'running',
              };
            }
            break;

          case 'initContainerTerminated':
            if (deploymentState.containers[newLog.name]) {
              deploymentState.containers[newLog.name] = {
                ...deploymentState.containers[newLog.name],
                status: newLog.exitCode === 0 ? 'completed' : 'failed',
                startedAt: newLog.startedAt,
                finishedAt: newLog.finishedAt,
                exitCode: newLog.exitCode,
                reason: newLog.reason,
              };
            }
            break;

          case 'mainContainerRunning':
            // Find the main container and mark it as running
            Object.keys(deploymentState.containers).forEach(name => {
              if (deploymentState.containers[name].type === 'main') {
                deploymentState.containers[name] = {
                  ...deploymentState.containers[name],
                  status: 'running',
                };
              }
            });
            break;

          case 'mainContainerReady':
            // Find the main container and mark it as ready
            Object.keys(deploymentState.containers).forEach(name => {
              if (deploymentState.containers[name].type === 'main') {
                deploymentState.containers[name] = {
                  ...deploymentState.containers[name],
                  status: 'ready',
                };
              }
            });
            deploymentState.isReady = true;
            break;

          case 'mainContainerCrashed':
            // Find the main container and mark it as failed
            Object.keys(deploymentState.containers).forEach(name => {
              if (deploymentState.containers[name].type === 'main') {
                deploymentState.containers[name] = {
                  ...deploymentState.containers[name],
                  status: 'failed',
                  startedAt: newLog.startedAt,
                  finishedAt: newLog.finishedAt,
                  exitCode: newLog.exitCode,
                  reason: newLog.reason,
                };
              }
            });
            deploymentState.hasCrashed = true;
            break;

          case 'error':
            deploymentState.errors.push(newLog.message);
            break;

          default:
            // Handle new message types like mainContainerCrashBackOff
            if ((newLog as any).type === 'mainContainerCrashBackOff') {
              // Find the main container and mark it as crash back off
              Object.keys(deploymentState.containers).forEach(name => {
                if (deploymentState.containers[name].type === 'main') {
                  deploymentState.containers[name] = {
                    ...deploymentState.containers[name],
                    status: 'crashBackOff',
                    reason: (newLog as any).reason,
                    restarts: (newLog as any).restarts,
                  };
                }
              });
            }
            break;
        }
        printCurrentState();

        // If ready, resolve successfully
        if (deploymentState.isReady) {
          eventSource.close();
          clearTimeout(timeout);
          resolve({
            deployed: true,
            stabilized: true,
            podName: deploymentState.podInfo?.pod,
          });
        }

        // If crashed, return failed status instead of rejecting
        if (deploymentState.hasCrashed) {
          eventSource.close();
          clearTimeout(timeout);
          resolve({
            deployed: true,
            stabilized: false,
            podName: deploymentState.podInfo?.pod,
          });
        }
      } catch (error) {
        console.error('Error parsing deployment log:', error);
        deploymentState.errors.push('Failed to parse deployment log');
        printCurrentState();
        eventSource.close();
        clearTimeout(timeout);
        resolve({
          deployed: false,
          stabilized: false,
          podName: deploymentState.podInfo?.pod,
        });
      }
    });

    eventSource.onerror = (error: any) => {
      deploymentState.errors.push('Connection error occurred: ' + getErrorMessage(error));
      printCurrentState();
      eventSource.close();
      console.error('EventSource error:', error);
      clearTimeout(timeout);
      resolve({
        deployed: false,
        stabilized: false,
        podName: deploymentState.podInfo?.pod,
      });
    };
  });
}

export async function listServers(gatana: Gatana): Promise<HostedServerInfo[]> {
  const { data, error } = await gatana.api.getMcpServers();

  if (error) {
    throw new Error(`Failed to list servers: ${getErrorMessage(error)}`);
  }

  return data?.servers || [];
}

export async function getServer(gatana: Gatana, serverSlug: string): Promise<ServerDto> {
  const { data, error } = await gatana.api.getMcpServersByServerSlug({
    path: { serverSlug },
  });

  if (error) {
    throw new Error(`Failed to get server: ${getErrorMessage(error)}`);
  }

  if (!data?.server) {
    throw new Error(`Server with ID ${serverSlug} not found`);
  }

  return data.server;
}

export async function cleanupZipFile(zipPath: string): Promise<void> {
  try {
    const fs = await import('fs/promises');
    await fs.unlink(zipPath);
  } catch (error) {
    console.warn(`Warning: Could not clean up temporary ZIP file: ${zipPath}`);
  }
}

export async function initLocalSourceCode(targetPath: string): Promise<void> {
  const resolvedPath = resolve(targetPath);

  if (existsSync(resolvedPath)) {
    const files = await readdir(resolvedPath);
    if (files.length > 0) {
      const proceed = await confirm({
        message: `The directory ${resolvedPath} is not empty. Do you want to initialize the source code template here?`,
        default: false,
      });
      if (!proceed) {
        outputInfo('Initialization cancelled.');
        return;
      }
    }
  } else {
    await mkdir(resolvedPath, { recursive: true });
  }

  const template = `import z from 'zod';

export const schema = {
    whoami: {
        description: 'returns HTTP headers',
    },
    add: {
        description: 'adds two numbers',
        input: z.object({
            a: z.number(),
            b: z.number(),
        })
    },
};
export function whoami(args, credentials) {
    return JSON.stringify(credentials)
}
export function add({ a, b } = params) {
    return String(Number(a) + Number(b))
}\n`;
  await writeFile(join(resolvedPath, 'index.js'), template, 'utf-8');

  outputInfo(`Initialized hosted server source code template at ${resolvedPath}`);
}
/**
 * Dynamically import a local source-code module and return the implementation.
 * The module must export a `schema` object and matching functions for each tool.
 */
// Dependencies that are pre-installed in the hosted runtime environment.
// When running locally, we temporarily symlink them from the CLI's own
// node_modules so the user doesn't need to install them in the source dir.
const RUNTIME_DEPS = ['zod'];

/**
 * Convert a potentially complex object (e.g. a Zod schema) into a
 * plain, YAML/JSON-serializable representation.
 */
function serializableInput(input: any): any {
  if (input == null) return null;

  // Zod v4: toJSONSchema lives on the `z` namespace
  try {
    if (typeof z.toJSONSchema === 'function') {
      return z.toJSONSchema(input);
    }
  } catch {
    // toJSONSchema not available or failed
  }

  // Zod-like: extract shape keys with type hints
  if (typeof input === 'object' && input.shape && typeof input.shape === 'object') {
    const shape: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.shape)) {
      const v = value as any;
      shape[key] = v?._zpiType || v?._def?.typeName || typeof value;
    }
    return shape;
  }

  return String(input);
}

async function importLocalModule(resolvedPath: string): Promise<{ impl: any; entrypoint: string }> {
  const { pathToFileURL } = await import('node:url');
  const entrypoint = join(resolvedPath, 'index.js');

  if (!existsSync(entrypoint)) {
    throw new Error(`index.js not found in ${resolvedPath}`);
  }

  // Temporarily symlink runtime deps so they resolve from the source directory
  const sourceNodeModules = join(resolvedPath, 'node_modules');
  const linkedPaths: string[] = [];

  for (const dep of RUNTIME_DEPS) {
    const linkPath = join(sourceNodeModules, dep);
    if (!existsSync(linkPath)) {
      try {
        const depPkg = _require.resolve(`${dep}/package.json`);
        const depDir = dirname(depPkg);
        await mkdir(sourceNodeModules, { recursive: true });
        await symlink(depDir, linkPath, 'dir');
        linkedPaths.push(linkPath);
      } catch {
        // If the dep isn't installed in the CLI either, let the import fail naturally
      }
    }
  }

  try {
    const fileUrl = pathToFileURL(entrypoint).href;
    const impl = await import(fileUrl);

    if (!impl.schema || typeof impl.schema !== 'object') {
      throw new Error('Module does not export a valid "schema" object.');
    }

    return { impl, entrypoint };
  } finally {
    // Clean up symlinks we created
    for (const linkPath of linkedPaths) {
      try {
        await rm(linkPath, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
    // Remove node_modules dir if we created it and it's now empty
    if (linkedPaths.length > 0 && existsSync(sourceNodeModules)) {
      try {
        const remaining = await readdir(sourceNodeModules);
        if (remaining.length === 0) {
          await rm(sourceNodeModules, { recursive: true });
        }
      } catch {
        // ignore
      }
    }
  }
}

export async function runLocalVerifySourceCode(sourcePath: string): Promise<void> {
  try {
    const result = await localVerifySourceCode(sourcePath);
    output(result);

    if (!result.valid) {
      process.exit(1);
    }
  } catch (err) {
    outputError(`Error verifying source code: ${getErrorMessage(err)}`);
    process.exit(1);
  }
}

/**
 * Verify local source-code: checks that index.js exists, exports a schema,
 * and each tool in the schema has a matching exported function.
 * `gatana hosted local-verify <path>`
 */
export async function localVerifySourceCode(sourcePath: string) {
  const { resolve } = await import('path');
  const resolvedPath = resolve(sourcePath);

  // Static check first
  const indexCheck = checkIndexJsExists(resolvedPath);
  if (!indexCheck.exists) {
    outputError(`index.js not found in ${resolvedPath}`);
    process.exit(1);
  }

  if (!indexCheck.hasSchema) {
    outputError(
      `index.js does not contain a schema export. ` +
        `Make sure your file exports a schema:\n` +
        `  \u2022 ES modules: export const schema = { ... }\n` +
        `  \u2022 CommonJS: module.exports.schema = { ... }`
    );
    process.exit(1);
  }

  // Dynamic import to validate at runtime
  let impl: any;
  try {
    ({ impl } = await importLocalModule(resolvedPath));
  } catch (err) {
    outputError(`Failed to import module: ${getErrorMessage(err)}`);
    process.exit(1);
  }

  const schemaEntries = Object.entries(impl.schema);
  if (schemaEntries.length === 0) {
    outputInfo('Warning: schema is empty \u2014 no tools defined.');
  }

  // Collect all exported functions (excluding schema and default export)
  const exportedFunctions = Object.keys(impl).filter(k => typeof impl[k] === 'function' && k !== 'default');
  const schemaNames = new Set(schemaEntries.map(([name]) => name));

  const results: {
    name: string;
    valid: boolean;
    hasExport: boolean;
    schema: Record<string, any> | null;
    issues: string[];
  }[] = [];

  // Check each schema entry
  for (const [name, func] of schemaEntries) {
    const issues: string[] = [];
    const descriptor = func as Record<string, any>;

    if (!descriptor.description) {
      issues.push('missing description');
    }

    const hasExport = typeof impl[name] === 'function';
    if (!hasExport) {
      issues.push(`no exported function "${name}" found`);
    }

    results.push({
      name,
      valid: issues.length === 0,
      hasExport,
      schema: {
        description: descriptor.description || null,
        input: serializableInput(descriptor.input),
      },
      issues,
    });
  }

  // Check for exported functions that have no matching schema entry
  const orphanedExports = exportedFunctions.filter(name => !schemaNames.has(name));
  for (const name of orphanedExports) {
    results.push({
      name,
      valid: false,
      hasExport: true,
      schema: null,
      issues: [`exported function "${name}" has no matching schema entry`],
    });
  }

  const allValid = results.every(r => r.valid);

  return {
    path: resolvedPath,
    toolCount: schemaEntries.length,
    exportedFunctions: exportedFunctions.length,
    tools: results,
    valid: allValid,
  };
}

/**
 * Run a single tool from local source-code.
 * `gatana hosted local-run <path> <tool> [-i <json>] [-f <file>]`
 */
export async function localRunTool(
  sourcePath: string,
  toolName: string,
  options: { input?: string; file?: string; param?: string[] }
): Promise<void> {
  const { resolve } = await import('path');
  const resolvedPath = resolve(sourcePath);

  let impl: any;
  try {
    ({ impl } = await importLocalModule(resolvedPath));
  } catch (err) {
    outputError(`Failed to import module: ${getErrorMessage(err)}`);
    process.exit(1);
  }

  if (!impl.schema[toolName]) {
    const available = Object.keys(impl.schema).join(', ');
    outputError(`Tool "${toolName}" not found in schema. Available tools: ${available}`);
    process.exit(1);
  }

  if (typeof impl[toolName] !== 'function') {
    outputError(`Tool "${toolName}" is defined in schema but has no exported function.`);
    process.exit(1);
  }

  // Parse input from --input flag, --file flag, or -p params
  let inputData: unknown = {};
  if (options.input) {
    try {
      inputData = JSON.parse(options.input);
    } catch (err) {
      outputError(`Failed to parse inline JSON: ${getErrorMessage(err)}`);
      process.exit(1);
    }
  } else if (options.file) {
    try {
      const fileContent = readFileSync(resolve(options.file), 'utf-8');
      inputData = JSON.parse(fileContent);
    } catch (err) {
      outputError(`Failed to read/parse input file: ${getErrorMessage(err)}`);
      process.exit(1);
    }
  }

  // Merge -p key=value params (applied on top of --input/--file)
  if (options.param && options.param.length > 0) {
    const obj = (typeof inputData === 'object' && inputData !== null ? { ...(inputData as any) } : {}) as Record<
      string,
      unknown
    >;
    for (const p of options.param) {
      const eqIdx = p.indexOf('=');
      if (eqIdx === -1) {
        outputError(`Invalid param format: "${p}". Expected key=value`);
        process.exit(1);
      }
      const key = p.slice(0, eqIdx);
      let value: unknown = p.slice(eqIdx + 1);
      // Try to parse as JSON for numbers, booleans, arrays, objects
      try {
        value = JSON.parse(value as string);
      } catch {
        // keep as string
      }
      _.set(obj, key, value);
    }
    inputData = obj;
  }

  // Validate input against the tool's Zod schema (if defined)
  const inputSchema = impl.schema[toolName].input;
  if (inputSchema && typeof inputSchema.safeParse === 'function') {
    const result = inputSchema.safeParse(inputData);
    if (!result.success) {
      outputError(`Input validation failed for tool "${toolName}":`);
      for (const issue of result.error?.issues ?? result.error?.errors ?? []) {
        outputError(`  - ${issue.path?.join('.') || '(root)'}: ${issue.message}`);
      }
      output({ expected: serializableInput(inputSchema) });
      process.exit(1);
    }
    // Use the parsed (coerced/defaulted) value
    inputData = result.data;
  }

  // Execute the tool with a mock session (no real auth headers locally)
  try {
    outputInfo(`Running tool "${toolName}"...`);
    const result = await impl[toolName](inputData, { headers: {} });
    output(result);
  } catch (err) {
    outputError(`Tool execution failed: ${getErrorMessage(err)}`);
    process.exit(1);
  }
}
