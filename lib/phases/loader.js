/**
 * @file Project phases loader and check-file binding for P2.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECT_PHASES_FILE, ERROR_CODES, PACKAGED_DEFAULT_PHASES_FILE } from '../contracts.js';
import { PhaseGateError } from '../errors.js';
import { parseYamlSubset } from '../yaml-subset.js';
import { bindCheckFiles, mergePhasesDocuments } from './schema.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @param {string} text
 * @returns {unknown}
 */
export function parsePhasesText(text) {
  try {
    return parseYamlSubset(text);
  } catch (error) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `invalid phases YAML: ${error.message}`, {}, { cause: error });
  }
}

/**
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
export async function readCheckFiles(projectRoot) {
  try {
    const entries = await readdir(join(projectRoot, 'work', 'checks'), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readOptionalText(projectRoot, filePath) {
  try {
    return await readFile(join(projectRoot, filePath), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Load the default phases, merge a project override, and bind check files.
 *
 * @param {string} projectRoot
 * @param {{defaultPhasesFile?: string, projectPhasesFile?: string, validateChecks?: boolean}} [options]
 * @returns {Promise<Readonly<{document: Readonly<object>, bindings: Readonly<Record<string, string>>}>>}
 */
export async function loadPhases(projectRoot, options = {}) {
  const defaultPath = options.defaultPhasesFile ?? join(PACKAGE_ROOT, PACKAGED_DEFAULT_PHASES_FILE);
  const projectPath = options.projectPhasesFile ?? DEFAULT_PROJECT_PHASES_FILE;
  const validateChecks = options.validateChecks ?? true;

  let defaultText;
  try {
    defaultText = await readFile(defaultPath, 'utf8');
  } catch (error) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `default phases file not found: ${defaultPath}`, {}, { cause: error });
  }

  const projectText = await readOptionalText(projectRoot, projectPath);
  const document = mergePhasesDocuments(
    parsePhasesText(defaultText),
    projectText === null ? null : parsePhasesText(projectText),
  );

  let bindings = {};
  if (validateChecks) {
    const checkFiles = await readCheckFiles(projectRoot);
    const bound = bindCheckFiles(document, checkFiles);
    bindings = Object.freeze(Object.fromEntries(bound.entries()));
  }

  return Object.freeze({ document, bindings });
}

