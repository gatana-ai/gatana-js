import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import _ from 'lodash';
import { Gatana, Gatana2 } from 'gatana-sdk';
import { callTool } from '../../actions/server-mgmt/tools.js';

export function createToolsCommand(gatana: Gatana, gatana2: Gatana2): Command {
  const cmd = new Command('tools')
    .alias('tool')
    .description('Call a tool. See "gatana get tools" for the list of available tools')
    .addHelpText(
      'after',
      `
Get the tool schema by running "gatana get tools <tool_name>"
Examples:
  # Dot-notation key=value pairs
  $ gatana tool my_tool -a argument1="arg1 value" -a argument2.nested="nested value"

  # Inline JSON
  $ gatana tool my_tool -a '{"argument1": "arg1 value", "argument2": {"nested": "nested value"}}'

  # From a JSON file
  $ gatana tool my_tool -f arg.json

  # From stdin
  $ echo '{"argument1": "Piped"}' | gatana tool my_tool
`
    )
    .argument('<tool name>', 'Name of the tool to call. See "gatana get tools" for the list of available tools')
    .option('-f, --file <path>', 'JSON file with argument (omit to read from stdin)')
    .option('-a, --arg <kv...>', 'Inline argument: JSON string or dot-notation key=value pairs')
    .addOption(
      new Option('-p, --part <type>', 'Output part of the raw response')
        .choices(['structured', 'unstructured'])
        .default('structured')
    )
    .action(async (toolName: string, options: { file?: string; arg?: string[]; part?: string }) => {
      const args = options.file ? JSON.parse(readFileSync(options.file, 'utf-8')) : {};
      if (options.arg) {
        const joined = options.arg.join(' ');
        if (joined.trimStart().startsWith('{')) {
          Object.assign(args, JSON.parse(joined));
        } else {
          // Dot-notation: key=value pairs → nested object
          for (const kv of options.arg) {
            const eqIdx = kv.indexOf('=');
            if (eqIdx === -1) {
              console.error(`Invalid key=value pair: "${kv}". Expected format: key.path=value`);
              process.exit(1);
            }
            const key = kv.slice(0, eqIdx);
            let val: any = kv.slice(eqIdx + 1);
            // Coerce booleans, numbers, and null
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === 'null') val = null;
            else if (val !== '' && !isNaN(Number(val))) val = Number(val);
            _.set(args, key, val);
          }
        }
      }
      await callTool(gatana, gatana2, toolName, args, (options.part || 'structured') as 'unstructured' | 'structured');
    })
    .showHelpAfterError(true);

  return cmd;
}
