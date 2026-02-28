import { Gatana } from 'gatana-sdk';
import { getSandboxes, getSandboxesBySandboxId, postSandboxes, deleteSandboxesBySandboxId } from 'gatana-sdk/api';
import { output, outputError, outputSuccess, TableColumn } from '../../output.js';
import { formatAge } from '../../utils/utils.js';

const sandboxTableColumns: TableColumn[] = [
  { name: 'id', title: 'ID', alignment: 'left' },
  { title: 'User', valueGet: row => row.user?.email ?? '<unknown>', alignment: 'left' },
  { name: 'isArchived', title: 'Archived', alignment: 'center' },
  { title: 'Last Activity', valueGet: row => formatAge(row.lastActivityAt) },
  { title: 'Age', valueGet: row => formatAge(row.createdAt) },
];

/**
 * List all sandboxes, or get a single sandbox by ID.
 * `gatana get sandbox [id]`
 */
export async function getSandboxResource(gatana: Gatana, id?: string, all?: boolean): Promise<void> {
  try {
    if (id) {
      const { data, error } = await getSandboxesBySandboxId({ path: { sandboxId: id } });
      if (error || !data) {
        outputError(error || `Sandbox '${id}' not found.`);
        return;
      }
      output(data, { defaultFormat: 'yaml' });
    } else {
      const { data, error } = await getSandboxes({ query: { all: all ? 'true' : 'false' } });
      if (error || !data) {
        outputError(error || 'Failed to list sandboxes.');
        return;
      }
      output({ sandboxes: data.sandboxes || [] }, { tableColumns: sandboxTableColumns, defaultFormat: 'table' });
    }
  } catch (error) {
    outputError(error);
  }
}

/**
 * Create a new sandbox.
 * `gatana create sandbox`
 */
export async function createSandboxResource(gatana: Gatana): Promise<void> {
  try {
    const { data, error } = await postSandboxes();
    if (error || !data) {
      outputError(error || 'Failed to create sandbox.');
      return;
    }
    output(data.sandbox, { defaultFormat: 'yaml' });
  } catch (error) {
    outputError(error);
  }
}

/**
 * Delete a sandbox by ID.
 * `gatana delete sandbox <id>`
 */
export async function deleteSandboxResource(gatana: Gatana, sandboxId: string): Promise<void> {
  try {
    const { error } = await deleteSandboxesBySandboxId({ path: { sandboxId } });
    if (error) {
      outputError(error);
      return;
    }
    outputSuccess(`Sandbox '${sandboxId}' deleted successfully.`);
  } catch (error) {
    outputError(error);
  }
}
