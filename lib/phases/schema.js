/**
 * @file Phase definition schema and merge rules for P2.
 */

import { ERROR_CODES, PHASES_VERSION } from '../contracts.js';
import { requireSafeRelativePath } from '../config.js';
import { PhaseGateError } from '../errors.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `${field} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function requireStringArray(value, field) {
  if (!Array.isArray(value)) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `${field} must be an array`);
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`));
}

/**
 * @param {unknown} value
 * @returns {object[]}
 */
function normalizeSupersedes(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, 'supersedes must be an array');
  }
  return value.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `supersedes[${index}] must be an object`);
    }
    return Object.freeze({
      source: requireString(item.source, `supersedes[${index}].source`),
      replacedBy: requireString(item.replacedBy, `supersedes[${index}].replacedBy`),
      reason: requireString(item.reason, `supersedes[${index}].reason`),
      at: requireString(item.at, `supersedes[${index}].at`),
    });
  });
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireCheckPrefix(value, field) {
  const text = requireString(value, field);
  if (!/^\d{3}$/u.test(text)) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `${field} must match NNN`);
  }
  return text;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireArtifactPath(value, field) {
  try {
    return requireSafeRelativePath(value, field);
  } catch (error) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, error.message, { field }, { cause: error });
  }
}

/**
 * Validate and normalize one phases document.
 *
 * @param {unknown} document
 * @returns {Readonly<object>}
 */
export function normalizePhasesDocument(document) {
  if (!isPlainObject(document)) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, 'phases document must be an object');
  }
  if (document.version !== PHASES_VERSION) {
    throw new PhaseGateError(
      ERROR_CODES.PHASES_INVALID,
      `phases version must be ${PHASES_VERSION}`,
      { actual: document.version },
    );
  }
  if (!Array.isArray(document.phases) || document.phases.length === 0) {
    throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, 'phases must be a non-empty array');
  }

  const seen = new Set();
  const phases = document.phases.map((rawPhase, index) => {
    if (!isPlainObject(rawPhase)) {
      throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `phases[${index}] must be an object`);
    }
    const id = requireString(rawPhase.id, `phases[${index}].id`);
    if (seen.has(id)) {
      throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `duplicate phase id: ${id}`);
    }
    seen.add(id);
    const name = requireString(rawPhase.name, `phases[${index}].name`);
    if (!isPlainObject(rawPhase.exit)) {
      throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `phases[${index}].exit must be an object`);
    }

    const checks = requireStringArray(rawPhase.exit.checks, `phases[${index}].exit.checks`).map(
      (prefix, checkIndex) => requireCheckPrefix(prefix, `phases[${index}].exit.checks[${checkIndex}]`),
    );
    const artifacts = requireStringArray(rawPhase.exit.artifacts, `phases[${index}].exit.artifacts`).map(
      (artifact, artifactIndex) => requireArtifactPath(artifact, `phases[${index}].exit.artifacts[${artifactIndex}]`),
    );
    const commonPitfalls = rawPhase.commonPitfalls === undefined
      ? []
      : requireStringArray(rawPhase.commonPitfalls, `phases[${index}].commonPitfalls`);

    return Object.freeze({
      id,
      name,
      exit: Object.freeze({ checks: Object.freeze(checks), artifacts: Object.freeze(artifacts) }),
      commonPitfalls: Object.freeze(commonPitfalls),
    });
  });

  return Object.freeze({
    version: PHASES_VERSION,
    supersedes: Object.freeze(normalizeSupersedes(document.supersedes)),
    phases: Object.freeze(phases),
  });
}

/**
 * Merge a project document over a default document by phase id.
 * Existing ids replace; new ids append. Supersedes records concatenate.
 *
 * @param {unknown} defaultDocument
 * @param {unknown|null|undefined} projectDocument
 * @returns {Readonly<object>}
 */
export function mergePhasesDocuments(defaultDocument, projectDocument) {
  const base = normalizePhasesDocument(defaultDocument);
  if (projectDocument === null || projectDocument === undefined) return base;
  const overlay = normalizePhasesDocument(projectDocument);

  const order = [];
  const byId = new Map();
  for (const phase of base.phases) {
    order.push(phase.id);
    byId.set(phase.id, phase);
  }
  for (const phase of overlay.phases) {
    if (!byId.has(phase.id)) order.push(phase.id);
    byId.set(phase.id, phase);
  }

  return normalizePhasesDocument({
    version: PHASES_VERSION,
    supersedes: [...base.supersedes, ...overlay.supersedes],
    phases: order.map((id) => byId.get(id)),
  });
}

/**
 * Bind numeric check prefixes to exactly one `NNN-*.ps1` file.
 *
 * @param {Readonly<object>} phasesDocument
 * @param {string[]} checkFiles
 * @returns {ReadonlyMap<string, string>}
 */
export function bindCheckFiles(phasesDocument, checkFiles) {
  if (!Array.isArray(checkFiles)) throw new TypeError('checkFiles must be an array');
  const files = checkFiles.filter((name) => typeof name === 'string' && name.endsWith('.ps1'));
  const bindings = new Map();
  const owners = new Map();

  for (const phase of phasesDocument.phases) {
    for (const prefix of phase.exit.checks) {
      const matches = files.filter((name) => name.startsWith(`${prefix}-`));
      if (matches.length === 0) {
        throw new PhaseGateError(ERROR_CODES.UNKNOWN_CHECK, `no check file matches prefix ${prefix}`, {
          phase: phase.id,
          prefix,
        });
      }
      if (matches.length > 1) {
        throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `multiple check files match prefix ${prefix}`, {
          phase: phase.id,
          prefix,
          matches,
        });
      }
      const file = matches[0];
      const previousOwner = owners.get(file);
      if (previousOwner !== undefined) {
        throw new PhaseGateError(ERROR_CODES.PHASES_INVALID, `check file ${file} is shared by multiple phases`, {
          file,
          previousOwner,
          phase: phase.id,
        });
      }
      owners.set(file, phase.id);
      bindings.set(prefix, file);
    }
  }

  return bindings;
}


