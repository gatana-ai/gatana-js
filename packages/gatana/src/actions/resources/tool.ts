import { ServerToolDto } from 'gatana-sdk/api';
import { Gatana } from 'gatana-sdk';
import { output, outputError, TableColumn } from '../../output.js';
import _ from 'lodash';

// Table columns used for listing servers
const toolTableColumns: TableColumn[] = [
  { name: 'universalName', title: 'Name', alignment: 'left' },
  { name: 'serverSlug', title: 'Server', alignment: 'center' },
  { name: 'isEnabled', title: 'Enabled', alignment: 'center' },
];

/**
 * List all servers, or get a single server by slug.
 * `gatana get tool [name]`
 */
export async function getToolResource(gatana: Gatana, toolName?: string, onlyEnabled?: boolean): Promise<void> {
  try {
    if (!toolName) {
      const { data } = await gatana.api.getTools();
      if (!data) {
        outputError('No data returned');
        process.exit(1);
      }
      const tools = data?.tools?.filter(t => !onlyEnabled || t.isEnabled);
      output(tools, { tableColumns: toolTableColumns, defaultFormat: 'table' });
    } else {
      const splitIndex = toolName.indexOf('_');
      const serverSlug = toolName.substring(0, splitIndex);
      const name = toolName.substring(splitIndex + 1);
      const { data } = await gatana.api.getMcpServersByServerSlugToolsByToolName({
        path: {
          serverSlug: serverSlug,
          toolName: name,
        },
      });
      if (!data) {
        outputError('No data returned');
        process.exit(1);
      }
      output(data, { defaultFormat: 'yaml' });
    }
  } catch (error) {
    outputError(error);
  }
}
