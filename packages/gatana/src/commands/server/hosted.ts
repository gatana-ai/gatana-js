import { Command } from 'commander';
import { Gatana } from 'gatana-sdk';
import _ from 'lodash';
import { deployServerResource } from '../../actions/resources/server.js';
import {
  initLocalSourceCode,
  localVerifySourceCode,
  localRunTool,
  downloadSourceCode,
} from '../../actions/server-mgmt/hosted.js';

function collectParams(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function createHostedCommand(gatana: Gatana): Command {
  const cmd = new Command('hosted').description('Manage hosted servers (FaaS)');

  cmd.addCommand(
    new Command('init')
      .description('Initialize a new hosted server source-code directory with a template')
      .argument('[path]', 'Path to the source-code directory', process.cwd())
      .action(async (path: string) => {
        await initLocalSourceCode(path);
      })
  );
  cmd.addCommand(
    new Command('verify')
      .description('Verify local source-code')
      .argument('<path>', 'Path to the source-code directory')
      .action(async (path: string) => {
        await localVerifySourceCode(path);
      })
  );

  cmd.addCommand(
    new Command('run')
      .description('Call a tool in the local source-code for testing')
      .argument('<path>', 'Path to the source-code directory. Use . for current directory')
      .argument('<tool name>', 'Name of the tool to run')
      .option('-i, --input <json>', 'Inline input JSON for the tool call')
      .option('-f, --file <path>', 'Path to JSON file with input for the tool call (ignored if --input is used)')
      .option(
        '-p, --param <key=value>',
        'Set input parameter (dot-path supported, e.g. -p a=1 -p b.nested=2)',
        collectParams,
        []
      )
      .showHelpAfterError(true)
      .action(async (path: string, toolName: string, options: { input?: string; file?: string; param: string[] }) => {
        await localRunTool(path, toolName, options);
      })
  );

  cmd.addCommand(
    new Command('upload')
      .description('Upload new source-code')
      .argument('<name>', 'Server slug')
      .argument('[path]', 'Root directory path for deployment', process.cwd())
      .option('--create', 'Create a new server if it does not exist')
      .option('--no-logs', 'Skip fetching crash logs on deployment failure')
      .option('--no-wait', 'Skip waiting for deployment to finish before returning')
      .option('--force', 'Force deployment even if validation checks fail')
      .action(
        async (
          name: string,
          path: string,
          options: { noWait: boolean; force: boolean; create: boolean; noLogs: boolean }
        ) => {
          await deployServerResource(gatana, name, path, options);
        }
      )
  );

  cmd.addCommand(
    new Command('download')
      .description('Download the deployed source-code as a zip file')
      .argument('<name>', 'Server slug')
      .option('-o, --output <path>', 'Output file path (default: <name>.zip)')
      .action(async (name: string, options: { output?: string }) => {
        await downloadSourceCode(gatana, name, options);
      })
  );

  return cmd;
}
