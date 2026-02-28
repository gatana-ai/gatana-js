import { Command } from 'commander';
import { Gatana2 } from '../../../lib/v2.js';
import { output } from '../../output.js';

/**
 * Resolve all `$ref` pointers in a JSON Schema node against the root OpenAPI document.
 * Handles nested objects, arrays, and circular references.
 */
function resolveRefs(node: any, root: any, seen = new WeakSet()): any {
  if (node === null || typeof node !== 'object') return node;
  if (seen.has(node)) return node;
  seen.add(node);

  if (Array.isArray(node)) {
    return node.map(item => resolveRefs(item, root, seen));
  }

  if ('$ref' in node && typeof node.$ref === 'string') {
    const refPath = node.$ref.replace(/^#\//, '').split('/');
    let resolved: any = root;
    for (const segment of refPath) {
      resolved = resolved?.[segment];
    }
    if (resolved !== undefined) {
      return resolveRefs(resolved, root, seen);
    }
    // If unresolvable, return the $ref as-is
    return node;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = resolveRefs(value, root, seen);
  }
  return result;
}

export function createSchemaCommand(gatana2: Gatana2): Command {
  const cmd = new Command('schema').description('Print OpenAPI resource schemas');

  cmd
    .command('server')
    .description('Server DTO')
    .action(async () => {
      const openapi = await fetch(gatana2.getOpenApiSpecUrl()).then(res => res.json());
      const schema = openapi?.components?.schemas?.V2ServerDto;
      output(resolveRefs(schema, openapi), { defaultFormat: 'json' });
    });

  return cmd;
}
