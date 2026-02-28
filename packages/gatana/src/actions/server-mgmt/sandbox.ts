import { Gatana } from 'gatana-sdk';
import { postSandboxesBySandboxIdSshSession } from 'gatana-sdk/api';
import { outputError, outputInfo } from '../../output.js';
import { spawn } from 'child_process';

interface SshSessionResponse {
  token: string;
  host: string;
  port: number;
}

/**
 * Open an interactive SSH shell into a sandbox.
 * Calls POST /api/v1/sandboxes/{id}/ssh-session, then spawns `ssh`.
 *
 * `gatana sandbox shell <id>`
 */
export async function sandboxShell(gatana: Gatana, sandboxId: string): Promise<void> {
  try {
    const { data, error } = await postSandboxesBySandboxIdSshSession({
      path: { sandboxId },
    });

    if (error || !data) {
      outputError(error || 'Failed to create SSH session.');
      return;
    }

    const session = data as SshSessionResponse;

    outputInfo(`Connecting to sandbox ${sandboxId} via SSH (${session.host}:${session.port})...`);

    const sshArgs = [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-p',
      String(session.port),
      `${session.token}@${session.host}`,
    ];

    const ssh = spawn('ssh', sshArgs, { stdio: 'inherit' });

    const exitCode = await new Promise<number>(resolve => {
      ssh.on('close', code => resolve(code ?? 1));
      ssh.on('error', err => {
        outputError(`Failed to spawn ssh: ${err.message}`);
        resolve(1);
      });
    });

    process.exit(exitCode);
  } catch (err) {
    outputError(err);
  }
}
