import { Command } from 'commander';
import { Gatana } from '../../../lib/index.js';
import { listHostedFunctions } from '../../hosted.js';
import { output, outputError, TableColumn } from '../../output.js';

export function createLsCommand(gatana: Gatana): Command {
  return new Command('ls').description('List hosted tools').action(async () => {
    try {
      const functions = await listHostedFunctions(gatana);

      // Define table columns for hosted tools
      const functionsTableColumns: TableColumn[] = [
        { name: 'id', title: 'ID', alignment: 'left' },
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
