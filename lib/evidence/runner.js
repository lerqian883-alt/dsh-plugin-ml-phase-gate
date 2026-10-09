/**
 * @file Evidence check runner for P3.
 */

import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CHECK_EXIT, CHECK_STATUS, DEFAULT_CONFIG, ERROR_CODES, VERIFY_CANDIDATES } from '../contracts.js';
import { requireSafeRelativePath } from '../config.js';
import { PhaseGateError } from '../errors.js';
import { isPathInside } from '../project-root.js';
import { runProcess } from './process.js';

/**
 * @param {number|null} exitCode
 * @param {boolean} timedOut
 * @returns {'pass'|'fail'|'skip'|'error'|'timeout'}
 */
export function mapExitCodeToStatus(exitCode, timedOut = false) {
  if (timedOut) return CHECK_STATUS.TIMEOUT;
  if (exitCode === CHECK_EXIT.PASS) return CHECK_STATUS.PASS;
  if (exitCode === CHECK_EXIT.FAIL) return CHECK_STATUS.FAIL;
  if (exitCode === CHECK_EXIT.SKIP) return CHECK_STATUS.SKIP;
  return CHECK_STATUS.ERROR;
}

/**
 * Resolve the first configured or project-declared verify entry.
 *
 * @param {string} projectRoot
 * @param {string|null|undefined} verifyCommand
 * @returns {Promise<string>}
 */
async function resolveVerifyPath(projectRoot, verifyCommand) {
  const candidates = verifyCommand === null || verifyCommand === undefined
    ? VERIFY_CANDIDATES
    : [verifyCommand];
  const tried = [];
  for (const candidate of candidates) {
    let safeCommand;
    try {
      safeCommand = requireSafeRelativePath(candidate, 'verifyCommand');
    } catch (error) {
      throw new PhaseGateError(ERROR_CODES.CHECK_FAILED, error.message, { verifyCommand: candidate }, { cause: error });
    }
    const verifyPath = resolve(projectRoot, safeCommand);
    tried.push(safeCommand);
    if (!(await isPathInside(projectRoot, verifyPath))) {
      throw new PhaseGateError(ERROR_CODES.CHECK_FAILED, 'verifyCommand escapes project root', { verifyCommand: safeCommand });
    }
    try {
      const info = await stat(verifyPath);
      if (info.isFile()) return verifyPath;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
  throw new PhaseGateError(
    ERROR_CODES.UNKNOWN_CHECK,
    `verify command not found; tried: ${tried.join(', ')}`,
  );
}

/**
 * Build the project-gate invocation for one numeric check prefix.
 * The runner passes `NNN-` so verify scripts can match the exact prefix.
 *
 * @param {string} projectRoot
 * @param {string} prefix
 * @param {{verifyCommand?: string|null}} [options]
 * @returns {Promise<{command: string, args: string[], commandText: string}>}
 */
export async function buildVerifyInvocation(projectRoot, prefix, options = {}) {
  if (!/^\d{3}$/u.test(prefix)) {
    throw new PhaseGateError(ERROR_CODES.UNKNOWN_CHECK, `invalid check prefix: ${prefix}`);
  }
  const verifyPath = await resolveVerifyPath(projectRoot, options.verifyCommand);
  const filter = `${prefix}-`;
  const lower = verifyPath.toLowerCase();

  if (process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `""${verifyPath}" -Only ${filter}"`],
      commandText: `"${verifyPath}" -Only ${filter}`,
      windowsVerbatimArguments: true,
    };
  }
  if (lower.endsWith('.ps1')) {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    return {
      command: shell,
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', verifyPath, '-Only', filter],
      commandText: `${shell} -NoProfile -ExecutionPolicy Bypass -File "${verifyPath}" -Only ${filter}`,
    };
  }
  if (lower.endsWith('.mjs') || lower.endsWith('.js')) {
    return {
      command: process.execPath,
      args: [verifyPath, '-Only', filter],
      commandText: `${process.execPath} "${verifyPath}" -Only ${filter}`,
    };
  }
  if (lower.endsWith('.sh')) {
    return {
      command: 'sh',
      args: [verifyPath, '-Only', filter],
      commandText: `sh "${verifyPath}" -Only ${filter}`,
    };
  }
  return {
    command: verifyPath,
    args: ['-Only', filter],
    commandText: `"${verifyPath}" -Only ${filter}`,
  };
}

/**
 * Run one check prefix through the project's verify.cmd.
 *
 * @param {string} projectRoot
 * @param {string} stageId
 * @param {string} prefix
 * @param {{verifyCommand?: string, timeoutMs?: number, maxOutputBytes?: number}} [options]
 * @returns {Promise<Readonly<object>>}
 */
export async function runVerifyCheck(projectRoot, stageId, prefix, options = {}) {
  const invocation = await buildVerifyInvocation(projectRoot, prefix, options);
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_CONFIG.checkTimeoutMs;
  const result = await runProcess(invocation.command, invocation.args, {
    cwd: projectRoot,
    timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments ?? false,
  });
  return Object.freeze({
    stage: stageId,
    check: prefix,
    exitCode: result.exitCode ?? -1,
    status: mapExitCodeToStatus(result.exitCode, result.timedOut),
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    ranAt: new Date().toISOString(),
    command: invocation.commandText,
  });
}

/**
 * @param {string} projectRoot
 * @param {Readonly<{id: string, exit: {checks: string[]}}>} stage
 * @param {{verifyCommand?: string, timeoutMs?: number, maxOutputBytes?: number}} [options]
 * @returns {Promise<ReadonlyArray<Readonly<object>>>}
 */
export async function runStageChecks(projectRoot, stage, options = {}) {
  if (!stage || typeof stage.id !== 'string' || !Array.isArray(stage.exit?.checks)) {
    throw new PhaseGateError(ERROR_CODES.CHECK_FAILED, 'invalid stage for evidence checks');
  }
  const results = [];
  for (const prefix of stage.exit.checks) {
    try {
      results.push(await runVerifyCheck(projectRoot, stage.id, prefix, options));
    } catch (error) {
      results.push(Object.freeze({
        stage: stage.id,
        check: typeof prefix === 'string' ? prefix : String(prefix),
        exitCode: -1,
        status: CHECK_STATUS.ERROR,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: 0,
        ranAt: new Date().toISOString(),
        command: '',
      }));
    }
  }
  return Object.freeze(results);
}





