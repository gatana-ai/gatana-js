export type OutputFormat = 'json' | 'yaml' | 'table';

import yaml from 'js-yaml';
import chalk from 'chalk';
import _ from 'lodash';

export interface TableColumn {
  title: string;
  /** Dot-path key to pluck from the row (e.g. 'slug' or 'transport.type') */
  name?: string;
  /** Function that receives the full row and returns the cell value. Takes precedence over `name`. */
  valueGet?: (row: any) => any;
  alignment?: 'left' | 'center' | 'right';
}

interface OutputOptions {
  format: OutputFormat;
  formatExplicit: boolean;
  interactive: boolean;
}

let globalOptions: OutputOptions = {
  format: 'table',
  formatExplicit: false,
  interactive: true,
};

export function setOutputOptions(options: Partial<OutputOptions>) {
  globalOptions = { ...globalOptions, ...options };
}

export function getOutputOptions(): OutputOptions {
  return globalOptions;
}

/**
 * kubectl-style column formatter: uppercase headers, no borders, padded columns.
 * Example:
 *   NAME     SLUG     AGE
 *   github   github   3d
 */
function printKubectlTable(
  rows: Record<string, any>[],
  { tableColumns: columns, noHeaders }: { tableColumns?: TableColumn[]; noHeaders?: boolean } = {},
  writeFn: (...args: any[]) => void = console.log
): void {
  if (rows.length === 0) return;

  // Build resolvers: each column becomes { header, resolve(row) → string }
  const cols = columns
    ? columns.map(c => ({
        header: c.title.toUpperCase(),
        resolve: c.valueGet
          ? (row: any) => stringify(c.valueGet!(row))
          : (row: any) => stringify(c.name ? _.get(row, c.name) : row),
      }))
    : Object.keys(rows[0]).map(k => ({
        header: k.toUpperCase(),
        resolve: (row: any) => stringify(row[k]),
      }));

  const stringRows = rows.map(row => cols.map(c => c.resolve(row)));

  // Compute column widths (min = header length)
  const widths = cols.map((c, i) => Math.max(c.header.length, ...stringRows.map(r => r[i].length)));

  const GAP = '   '; // 3-space gap between columns (kubectl default)

  // Header
  if (!noHeaders) {
    writeFn(cols.map((c, i) => c.header.padEnd(widths[i])).join(GAP));
  }
  // Rows
  for (const row of stringRows) {
    writeFn(row.map((cell, i) => cell.padEnd(widths[i])).join(GAP));
  }
}

function stringify(v: any): string {
  if (v === null || v === undefined) return '<none>';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function output(
  data: any,
  options?: {
    error?: boolean;
    headers?: string[];
    noHeaders?: boolean;
    tableColumns?: TableColumn[];
    /** Used as the format when the user hasn't explicitly passed -f */
    defaultFormat?: OutputFormat;
  }
) {
  const format = !globalOptions.formatExplicit && options?.defaultFormat ? options.defaultFormat : globalOptions.format;
  const { interactive } = globalOptions;
  const isError = options?.error ?? false;

  // For errors in non-interactive mode, always use stderr
  const writeFn = isError && !interactive ? console.error : console.log;

  switch (format) {
    case 'json':
      if (isError && !interactive) {
        // In non-interactive mode, errors go to stderr as JSON
        console.error(JSON.stringify({ error: data }));
      } else {
        writeFn(JSON.stringify(data));
      }
      break;

    case 'yaml': {
      const raw = yaml.dump(data);
      if (isError && !interactive) {
        console.error(raw);
      } else {
        writeFn(raw);
      }
      break;
    }

    case 'table':
    default:
      if (Array.isArray(data) && data.length > 0) {
        printKubectlTable(data, options, writeFn);
      } else if (typeof data === 'object' && data !== null) {
        if (options?.tableColumns) {
          // Extract the array data if nested (e.g., { servers: [...] })
          const arrayData = Object.values(data).find(val => Array.isArray(val));
          if (arrayData && Array.isArray(arrayData)) {
            if (arrayData.length === 0) {
              writeFn(`No ${Object.keys(data)[0]} found.`);
            } else {
              printKubectlTable(arrayData, options, writeFn);
            }
          } else {
            // Single object with explicit columns
            printKubectlTable([data], options, writeFn);
          }
        } else {
          // No explicit columns — show key/value pairs kubectl-style
          const kvRows: Record<string, any>[] = [];
          const nestedEntries: [string, any][] = [];

          for (const [key, value] of Object.entries(data)) {
            if (value === null || typeof value !== 'object') {
              kvRows.push({ property: key, value: value ?? '<none>' });
            } else if (Array.isArray(value) && value.length === 0) {
              kvRows.push({ property: key, value: '[]' });
            } else if (!Array.isArray(value) && Object.keys(value).length === 0) {
              kvRows.push({ property: key, value: '{}' });
            } else {
              nestedEntries.push([key, value]);
            }
          }

          if (kvRows.length > 0) {
            printKubectlTable(
              kvRows,
              {
                tableColumns: [
                  { name: 'property', title: 'Property' },
                  { name: 'value', title: 'Value' },
                ],
              },
              writeFn
            );
          }

          // Print nested objects/arrays as separate sections
          for (const [key, value] of nestedEntries) {
            if (Array.isArray(value) && value.length > 0) {
              writeFn(`\n${key}:`);
              const items = value.map((item: any) =>
                typeof item === 'object' && item !== null ? item : { value: item }
              );
              printKubectlTable(items, undefined, writeFn);
            } else if (typeof value === 'object' && value !== null) {
              writeFn(`\n${key}:`);
              const nestedKvRows = Object.entries(value).map(([k, v]) => ({
                property: k,
                value: v === null || typeof v !== 'object' ? String(v ?? '<none>') : JSON.stringify(v),
              }));
              printKubectlTable(
                nestedKvRows,
                {
                  tableColumns: [
                    { name: 'property', title: 'Property' },
                    { name: 'value', title: 'Value' },
                  ],
                },
                writeFn
              );
            }
          }
        }
      } else {
        writeFn(data);
      }
      break;
  }
}

// Helper functions for common output patterns
export function outputSuccess(message: string, data?: any) {
  const { format } = globalOptions;
  if (format === 'json' || format === 'yaml') {
    output({ success: true, message, ...(data && { data }) });
  } else {
    output(`${message}`);
  }
}

export function outputError(error: any) {
  const { format } = globalOptions;
  const errorMessage = error?.message || error;

  if (format === 'json' || format === 'yaml') {
    output({ success: false, error: errorMessage }, { error: true });
  } else {
    output(errorMessage, { error: true });
  }

  // Exit with error code in non-interactive mode
  if (!globalOptions.interactive) {
    process.exit(1);
  }
}

export function outputInfo(message: string) {
  const { interactive } = globalOptions;

  // Only show info messages in interactive mode (for progress, etc.)
  if (interactive) {
    output(message);
  }
}

// Helper for showing progress messages that should go to stderr in non-interactive mode
export function outputProgress(message: string) {
  const { interactive } = globalOptions;

  if (interactive) {
    console.log(message);
  } else {
    console.error(message);
  }
}

/**
 * Clear the last `count` lines written to stdout.
 * Moves cursor up `count` lines, clears them, and resets the cursor to the start.
 */
export function clearLines(count: number = 1) {
  for (let i = 0; i < count; i++) {
    process.stdout.write('\x1b[1A\x1b[2K');
  }
}
