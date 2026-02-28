import { Command } from 'commander';
import { ConfigLoader, Gatana, Gatana2 } from 'gatana-sdk';
import { createGetCommand } from './basic/get.js';
import { createDescribeCommand } from './basic/describe.js';
import { createCreateCommand } from './basic/create.js';
import { createDeleteCommand } from './basic/delete.js';
import { createHostedCommand } from './server/hosted.js';
import { createAuthInfoCommand } from './utility/auth-info.js';
import { createDeployCommand } from './server/deploy.js';
import { createPatchCommand } from './basic/patch.js';
import { createConfigCommand } from './utility/config.js';
import { createSchemaCommand } from './utility/schema.js';
import { createCredsCommand } from './server/creds.js';
import { createToolsCommand } from './server/tool.js';

/**
 * Register all verb commands (get, describe, create, delete, deploy, logs, token, auth-info)
 * on the top-level program.
 */
export function registerRootCommands(
  program: Command,
  configLoader: ConfigLoader,
  gatana: Gatana,
  gatana2: Gatana2
): void {
  program.commandsGroup('Basic Commands:');
  program.addCommand(createGetCommand(gatana, gatana2));
  program.addCommand(createDescribeCommand(gatana, gatana2));
  program.addCommand(createCreateCommand(gatana, gatana2));
  program.addCommand(createDeleteCommand(gatana, gatana2));
  program.addCommand(createPatchCommand(gatana2));

  program.commandsGroup('Server Management:');
  program.addCommand(createToolsCommand(gatana, gatana2));
  program.addCommand(createDeployCommand(gatana));
  program.addCommand(createCredsCommand(gatana));
  program.addCommand(createHostedCommand(gatana));

  program.commandsGroup('Utility Commands:');
  program.addCommand(createConfigCommand(configLoader));
  program.addCommand(createAuthInfoCommand(gatana));
  program.addCommand(createSchemaCommand(gatana2));
}
