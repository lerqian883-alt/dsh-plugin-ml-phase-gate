/**
 * @file Child-process execution for P3 evidence checks.
 */

import { spawn } from 'node:child_process';

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const TIMEOUT_GRACE_MS = 1000;

/**
 * @param {import('node:child_process').ChildProcess} child
 */
function killProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    killer.on('error', () => { try { child.kill(); } catch {} });
    killer.on('close', (code) => {
      if (code !== 0) { try { child.kill(); } catch {} }
    });
    return;
  }
  try { child.kill('SIGKILL'); } catch {}
}

/**
 * Run one child process with bounded output and a hard timeout.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd: string, timeoutMs?: number, env?: Record<string, string>, maxOutputBytes?: number, shell?: boolean, windowsVerbatimArguments?: boolean}} options
 * @returns {Promise<{exitCode: number|null, stdout: string, stderr: string, durationMs: number, timedOut: boolean, command: string}>}
 */
export async function runProcess(command, args, options) {
  const started = Date.now();
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = Buffer.alloc(0);
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let settled = false;
  let hardTimer = null;
  let exitGraceTimer = null;
  let timeoutGraceTimer = null;
  let exitCodeFromExit = null;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      shell: options.shell ?? false,
      windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
    });

    const append = (current, chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      const remaining = Math.max(0, maxOutputBytes - current.length);
      return remaining > 0 ? Buffer.concat([current, buffer.subarray(0, remaining)]) : current;
    };

    child.stdout?.on('data', (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
      stdoutBuffer = append(stdoutBuffer, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderrBytes += Buffer.byteLength(chunk);
      stderrBuffer = append(stderrBuffer, chunk);
    });

    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      if (exitGraceTimer) clearTimeout(exitGraceTimer);
      if (timeoutGraceTimer) clearTimeout(timeoutGraceTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      const stdout = stdoutBuffer.toString('utf8') + (stdoutBytes > stdoutBuffer.length ? '\n...[truncated]...' : '');
      const stderr = stderrBuffer.toString('utf8') + (stderrBytes > stderrBuffer.length ? '\n...[truncated]...' : '');
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        command: [command, ...args].join(' '),
      });
    };

    hardTimer = options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          killProcessTree(child);
          timeoutGraceTimer = setTimeout(() => finish(null), TIMEOUT_GRACE_MS);
        }, options.timeoutMs)
      : null;

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      if (exitGraceTimer) clearTimeout(exitGraceTimer);
      if (timeoutGraceTimer) clearTimeout(timeoutGraceTimer);
      reject(error);
    });

    child.on('exit', (code) => {
      exitCodeFromExit = code;
      exitGraceTimer = setTimeout(() => finish(exitCodeFromExit), 250);
    });

    child.on('close', (code) => finish(code));
  });
}


