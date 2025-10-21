import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { listServers } from '../../hosted.js';
import { output, outputError, TableColumn } from '../../output.js';

export function createLsCommand(gatana: Gatana): Command {
  return new Command('ls').description('List servers').action(async () => {
    try {
      const functions = await listServers(gatana);

      // Define table columns for servers
      const functionsTableColumns: TableColumn[] = [
        { name: 'slug', title: 'Slug', alignment: 'left' },
        { name: 'name', title: 'Name', alignment: 'left' },
        { name: 'createdAt', title: 'Created', alignment: 'left' },
        { name: 'updatedAt', title: 'Updated', alignment: 'left' },
        { name: 'isEnabled', title: 'Enabled', alignment: 'center' },
      ];

      output({ functions }, { tableColumns: functionsTableColumns });
    } catch (error) {
      outputError(error);
    }
  });
}
