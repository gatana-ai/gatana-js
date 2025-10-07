import { Command } from 'commander';
import { createDeployCommand } from './deploy.js';
import { createUpdateCommand } from './update.js';
import { createLsCommand } from './ls.js';
import { createCreateCommand } from './create.js';
import { createGetCommand } from './get.js';
import { createShowCommand } from './show.js';
import { ConfigLoader, Gatana } from '../../../lib/index.js';

export function createHostedCommand(gatana: Gatana): Command {
  return new Command('hosted')
    .description('Manage hosted tools')
    .addCommand(createDeployCommand(gatana))
    .addCommand(createUpdateCommand(gatana))
    .addCommand(createLsCommand(gatana))
    .addCommand(createCreateCommand(gatana))
    .addCommand(createGetCommand(gatana))
    .addCommand(createShowCommand(gatana));
}
