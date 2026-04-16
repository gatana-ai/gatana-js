import { Command } from 'commander';
import { readFileSync } from 'fs';
import _ from 'lodash';
import { Gatana2 } from 'gatana-sdk';
import { output, outputError, outputProgress, outputSuccess } from '../../output.js';

export function createPatchCommand(gatana: Gatana2): Command {
  const cmd = new Command('patch').description('Patch a resource');

  cmd.addCommand(
    new Command('server')
      .description(
        'Patch an existing server (JSON Merge Patch RFC 7396 strategy). To get the schema, run "gatana schema server".'
      )
      .addHelpText(
        'after',
        `
To get the schema, run "gatana schema server".

Examples:
  # Dot-notation key=value pairs
  $ gatana patch server my-server -p description="Updated description"
  $ gatana patch server my-server -p isEnabled=false -p oauthMetadata.as.deviceAuthorizationEndpoint="https://auth.example.com/device"

  # Inline JSON
  $ gatana patch server my-server -p '{"description": "New desc", "isEnabled": true}'

  # From a JSON file
  $ gatana patch server my-server -f patch.json

  # From stdin
  $ echo '{"description": "Piped"}' | gatana patch server my-server
`
      )
      .argument('<serverSlug>', 'Server slug')
      .option('-f, --file <path>', 'JSON file with server config to patch (omit to read from stdin)')
      .option('-p, --patch <kv...>', 'Inline patch: JSON string or dot-notation key=value pairs')
      .action(async (serverSlug: string, options: { file?: string; patch?: string[] }) => {
        try {
          let raw: string | undefined;
          if (options.patch) {
            const joined = options.patch.join(' ');
            if (joined.trimStart().startsWith('{')) {
              raw = joined;
            } else {
              // Dot-notation: key=value pairs → nested object
              const obj: any = {};
              for (const pair of options.patch) {
                const eqIdx = pair.indexOf('=');
                if (eqIdx === -1) {
                  outputError(`Invalid key=value pair: "${pair}". Expected format: key.path=value`);
                  return;
                }
                const key = pair.slice(0, eqIdx);
                let val: any = pair.slice(eqIdx + 1);
                // Coerce booleans, numbers, and null
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (val === 'null') val = null;
                else if (val !== '' && !isNaN(Number(val))) val = Number(val);
                _.set(obj, key, val);
              }
              raw = JSON.stringify(obj);
              outputProgress('Constructed patch object from key=value pairs: ' + raw);
            }
          } else if (options.file) {
            raw = readFileSync(options.file, 'utf-8');
          } else if (!process.stdin.isTTY) {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk);
            }
            raw = Buffer.concat(chunks).toString('utf-8');
          }

          if (!raw) {
            outputError('No input provided. Use -f <file> or pipe JSON via stdin.');
            return;
          }

          let body: any;
          try {
            body = JSON.parse(raw.trim());
          } catch {
            outputError('Failed to parse JSON input.');
            return;
          }

          const { data } = await gatana.api.patchServersBySlug({
            path: { slug: serverSlug },
            body,
          });

          outputSuccess(`Server '${serverSlug}' patched successfully.`);
        } catch (error) {
          outputError(error);
        }
      })
  );

  return cmd;
}
