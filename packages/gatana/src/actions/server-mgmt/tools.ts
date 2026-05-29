import { Gatana, Gatana2 } from 'gatana-sdk';
import { output, outputError } from '../../output.js';

export async function callTool(
  gatana: Gatana,
  gatana2: Gatana2,
  toolName: string,
  args: Record<string, any> = {},
  part?: 'unstructured' | 'structured' | 'text'
): Promise<void> {
  const splitIndex = toolName.indexOf('_');
  if (splitIndex === -1) {
    outputError(`Invalid tool name: "${toolName}". Expected format: <server>_<tool_name>`);
    process.exit(1);
  }
  const slug = toolName.substring(0, splitIndex);
  const name = toolName.substring(splitIndex + 1);

  let data;
  try {
    ({ data } = await gatana.api.postMcpServersByServerSlugToolsByToolNameCall({
      path: {
        serverSlug: slug,
        toolName: name,
      },
      body: {
        args,
      },
    }));
  } catch (err: any) {
    const message = err?.detail || err?.message || err?.statusText || 'Unknown error calling tool';
    outputError(message);
    process.exit(1);
  }

  const result = data?.result;
  if (!result) {
    outputError('Gatana returned success but no result was returned! Please contact Gatana support.');
    return;
  }
  if (result.isError) {
    outputError(result);
    if (result.errorCode === 'auth-required') {
      const server = await gatana2.api.getServersBySlug({ path: { slug } });
      const method = server.data?.authorization.method;
      if (method === 'oauth') {
        outputError(`The server is missing credentials. Run "create creds ${slug}" to generate authorization url.`);
      } else {
        outputError(`The server is missing credentials. Call "create creds ${slug}" to set API key credentials.`);
      }
    }
    process.exit(1);
  }

  if (part === 'text') {
    const text = result.content?.find(x => x.type === 'text')?.text;
    if (text) {
      output(text);
    } else {
      outputError('no text content found in tool response');
    }
    return;
  }

  if (part === 'structured') {
    output(result.structuredContent || {}, { defaultFormat: 'yaml' });
    return;
  }

  output(result.content, { defaultFormat: 'yaml' });
}
