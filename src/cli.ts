#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setOutputOptions, OutputFormat } from './output.js';
import { ConfigLoader, EnvConfigStrategy, FileConfigStrategy, Gatana } from '../lib/index.js';
import { styleText } from 'util';
import { Gatana2 } from '../lib/v2.js';
import { registerRootCommands } from './commands/addCommands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find package.json — works both from src/ (dev) and dist/bin/ (built)
function findPackageJson(): string {
  for (const candidate of [
    join(__dirname, '../package.json'), // from src/
    join(__dirname, '../../package.json'), // from dist/bin/
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find package.json');
}

const packageJson = JSON.parse(readFileSync(findPackageJson(), 'utf8'));

const program = new Command();

interface GlobalOptions {
  output?: OutputFormat;
  nonInteractive?: boolean;
}

const configLoader = new ConfigLoader([new EnvConfigStrategy(), new FileConfigStrategy()]);
const gatana = new Gatana({ configLoader, isCli: true });
const gatana2 = new Gatana2({ configLoader, isCli: true });

program
  .name('gatana')
  .description('CLI tool for Gatana - AI agent management and querying')
  .version(packageJson.version)
  .option('-o, --output <format>', 'Output format (json, yaml, table)')

  .hook('preAction', thisCommand => {
    // Set output options based on global flags
    const opts = thisCommand.opts<GlobalOptions>();

    const formatExplicit = opts.output !== undefined;
    setOutputOptions({
      format: (opts.output as OutputFormat) || 'table',
      formatExplicit,
    });
  });

// Register verb commands (get, describe, create, delete, edit, deploy, logs)
registerRootCommands(program, configLoader, gatana, gatana2);

program.configureHelp({
  styleTitle: str => styleText(['whiteBright', 'bold'], str),
});
program.parse();
