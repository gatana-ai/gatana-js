import { readFileSync } from 'fs';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { output, outputError, outputSuccess, TableColumn } from '../../output.js';
import { formatAge } from '../../utils/utils.js';

const credentialsTableColumns: TableColumn[] = [
  { name: 'id', title: 'ID', alignment: 'left' },
  { name: 'serverSlug', title: 'Server', alignment: 'left' },
  { name: 'scope', title: 'Scope', alignment: 'left' },
  { name: 'type', title: 'Type', alignment: 'left' },
  { title: 'Owner Type', valueGet: row => (row.userEmail ? 'User' : 'Profile'), alignment: 'left' },
  { title: 'Owner', valueGet: row => row.userEmail ?? row.profileName ?? '<none>', alignment: 'left' },
  { title: 'Last Used', valueGet: row => formatAge(row.lastUsedAt), alignment: 'left' },
  { title: 'Authorized', valueGet: row => formatAge(row.authorizedAt), alignment: 'left' },
];

/**
 * List credentials for a server, or get a single credential by ID.
 * `gatana get credentials --server <slug> [id]`
 */
export async function getCredentialsResource(
  gatana: Gatana,
  gatana2: Gatana2,
  serverSlug?: string,
  id?: string,
  withEffectiveCredentials?: boolean
): Promise<void> {
  try {
    const { data } = await gatana2.api.getCredentials({ query: { serverSlug } });

    const credentials = (data as any)?.credentials ?? [];

    if (id) {
      const cred = credentials.find((c: any) => c.id === id);
      if (!cred) {
        outputError(`Credential '${id}' not found${serverSlug ? ` on server '${serverSlug}'` : ''}.`);
        return;
      }
      let secretRes: any = undefined;
      let effectiveRes: any = undefined;
      try {
        secretRes = await gatana2.api.getCredentialsByIdSecret({ path: { id } });
        if (withEffectiveCredentials) {
          effectiveRes = await gatana.api.getMcpServersByServerSlugCredentialsToken({
            path: { serverSlug: cred.serverSlug },
            query: { credentialsId: cred.id },
          });
        }
      } catch (error) {
        // ignore
      }

      output({ ...cred, secret: secretRes?.data, effective: effectiveRes?.data }, { defaultFormat: 'yaml' });
    } else {
      if (credentials.length === 0) {
        output({ credentials: [] }, { tableColumns: credentialsTableColumns });
        return;
      }
      output({ credentials }, { tableColumns: credentialsTableColumns, defaultFormat: 'table' });
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create credentials for a server.
 * Looks up the server to determine the auth method (oauth, apikey, or none).
 *
 * - oauth without file/stdin: returns the authorize URL for the user to open.
 * - oauth with -f or stdin: uploads the token-set JSON directly.
 * - apikey: requires -f or stdin with [["header","value"], …] JSON.
 * - none: informs the user no credentials are needed.
 *
 * `gatana create credentials <serverSlug>`
 * `gatana create credentials <serverSlug> -f keys.json`
 * `echo '[["X-Api-Key","secret"]]' | gatana create credentials <serverSlug>`
 */
export async function createCredentialsResource(
  gatana: Gatana,
  serverSlug: string,
  file?: string,
  scope?: 'user' | 'server'
): Promise<void> {
  try {
    // Look up the server to determine auth method
    const { data: server } = await gatana.api.getMcpServersByServerSlug({
      path: { serverSlug },
    });

    if (!server) {
      outputError(`Server '${serverSlug}' not found.`);

      return;
    }

    const method = server.server.authorization.method;

    if (!method || method === 'none') {
      outputSuccess('This server does not require credentials.');
      return;
    }

    // Default scope from server config if not explicitly provided
    if (!scope) {
      scope = server.server.authorization.credentialsScope;
    }

    // Read file or stdin if provided
    let raw: string | undefined;
    if (file) {
      raw = readFileSync(file, 'utf-8');
    } else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      raw = Buffer.concat(chunks).toString('utf-8');
    }

    if (method === 'oauth') {
      if (raw) {
        // Upload OAuth token-set directly
        let tokenSet: any;
        try {
          tokenSet = JSON.parse(raw.trim());
        } catch {
          outputError('Failed to parse OAuth token-set JSON.');
          return;
        }

        scope === 'server'
          ? await gatana.api.putMcpServersByServerSlugCredentialsServer({
              path: { serverSlug },
              body: { type: 'oauth', tokenSet },
            })
          : await gatana.api.putMcpServersByServerSlugCredentialsUser({
              path: { serverSlug },
              body: { type: 'oauth', tokenSet },
            });

        outputSuccess(`OAuth credentials set for server '${serverSlug}'.`);
      } else {
        // No file/stdin — return the authorize URL
        const { data } = await gatana.api.getMcpServersByServerSlugCredentialsAuthorizeUrl({
          path: { serverSlug },
          query: { scope: scope },
        });

        if (data?.url) {
          outputSuccess(
            `Open this URL to authorize (you can also provide token set directly via -f <file> or stdin):\n${data.url}`
          );
        } else {
          output(data, { defaultFormat: 'yaml' });
        }
      }
      return;
    }

    // method === 'apikey'
    if (!raw) {
      outputError('API key credentials require input via -f <file> or stdin as JSON: [["header","value"], …]');
      return;
    }

    let apikeys: Array<[string, string]>;
    try {
      apikeys = JSON.parse(raw.trim());
    } catch {
      outputError('Failed to parse API keys JSON. Expected format: [["header","value"], …]');
      return;
    }

    if (!Array.isArray(apikeys) || !apikeys.every(k => Array.isArray(k) && k.length === 2)) {
      outputError('API keys must be an array of [string, string] pairs: [["header","value"], …]');
      return;
    }

    scope === 'server'
      ? await gatana.api.putMcpServersByServerSlugCredentialsServer({
          path: { serverSlug },
          body: { type: 'apikey', apikeys },
        })
      : await gatana.api.putMcpServersByServerSlugCredentialsUser({
          path: { serverSlug },
          body: { type: 'apikey', apikeys },
        });

    outputSuccess(`API key credentials set for server '${serverSlug}'.`);
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a credential by ID, or all credentials for a server.
 * `gatana delete credentials -s <slug> [id]`
 */
export async function deleteCredentialsResource(gatana: Gatana, serverSlug: string, id?: string): Promise<void> {
  try {
    if (id) {
      await gatana.api.deleteMcpServersByServerSlugCredentialsByCredentialsId({
        path: { serverSlug, credentialsId: id },
      });

      outputSuccess(`Credential '${id}' deleted from server '${serverSlug}'.`);
    } else {
      const { data } = await gatana.api.deleteMcpServersByServerSlugCredentials({
        path: { serverSlug },
      });

      outputSuccess(`Deleted ${data?.deletedCount ?? 0} credentials from server '${serverSlug}'.`);
    }
  } catch (error) {
    outputError(error);
  }
}
