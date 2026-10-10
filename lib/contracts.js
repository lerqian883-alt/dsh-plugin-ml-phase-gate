/**
 * @file Frozen P0 contracts for the DSH ML phase gate plugin.
 *
 * This module is deliberately pure: it performs no I/O, registers nothing, and
 * has no dependency on Cordis, React, or DSH packages. P1 and later modules
 * import these names instead of re-declaring package, projection, event, or
 * slot identifiers.
 *
 * Contract version: 1.
 */

export const CONTRACT_VERSION = 1;
export const PHASES_VERSION = 1;
export const STATE_VERSION = 1;
export const EVALUATION_VERSION = 1;
export const SNAPSHOT_VERSION = 4;
export const PROJECTION_VERSION = 4;

export const PACKAGE_NAME = 'dsh-plugin-ml-phase-gate';
export const PLUGIN_NAME = 'ml-phase-gate';
export const PLUGIN_VERSION = '0.1.2';
export const ACTIVATION_MODES = Object.freeze({ AUTO: 'auto', ALWAYS: 'always', OFF: 'off' });
export const VERIFY_CANDIDATES = Object.freeze([
  'work/verify.cmd',
  'work/verify.ps1',
  'work/verify.mjs',
  'work/verify.sh',
]);

export const PROJECT_STATE_DIR = '.dsh-ml-phase';
export const DEFAULT_PROJECT_PHASES_FILE = '.dsh-ml-phase/phases.yml';
export const DEFAULT_PROJECT_STATE_FILE = '.dsh-ml-phase/state.json';
export const PACKAGED_DEFAULT_PHASES_FILE = 'phases.default.yml';

export const PROJECTION_KEY = 'mlPhase';
export const ACTIVATION_PROJECTION_KEY = 'mlPhaseActivation';
export const SNAPSHOT_SOURCE_KIND = PLUGIN_NAME;
export const SNAPSHOT_FORM = 'snapshot';

export const DOCK_SLOT = 'conversation.input.dock';
export const DOCK_ID = 'ml-phase';
export const DOCK_ORDER = 5;
export const LOCALE_NAMESPACE = 'mlPhase';

export const TOOL_NAMES = Object.freeze({
  STATUS: 'ml_phase_status',
  ADVANCE: 'ml_phase_advance',
  DEFER: 'ml_phase_defer',
  PHASES: 'ml_phase_phases',
});

export const PHASE_IDS = Object.freeze([
  'M0',
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
]);

export const CHECK_EXIT = Object.freeze({
  PASS: 0,
  FAIL: 1,
  SKIP: 2,
});

export const CHECK_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  SKIP: 'skip',
  ERROR: 'error',
  TIMEOUT: 'timeout',
});

export const ERROR_CODES = Object.freeze({
  NO_PROJECT_ROOT: 'E_NO_PROJECT_ROOT',
  PHASES_INVALID: 'E_PHASES_INVALID',
  UNKNOWN_CHECK: 'E_UNKNOWN_CHECK',
  STATE_CORRUPT: 'E_STATE_CORRUPT',
  CHECK_FAILED: 'E_CHECK_FAILED',
  CHECK_TIMEOUT: 'E_CHECK_TIMEOUT',
  ARTIFACT_MISSING: 'E_ARTIFACT_MISSING',
  WRITE_CONFLICT: 'E_WRITE_CONFLICT',
  DEFERRED: 'E_DEFERRED',
  PROJECTION_MISSING: 'E_PROJECTION_MISSING',
  SNAPSHOT_INVALID: 'E_SNAPSHOT_INVALID',
  INVALID_TRANSITION: 'E_INVALID_TRANSITION',
  PROJECT_ROOT_FORBIDDEN: 'E_PROJECT_ROOT_FORBIDDEN',
});

export const DEFAULT_CONFIG = Object.freeze({
  projectPhasesFile: DEFAULT_PROJECT_PHASES_FILE,
  projectStateFile: DEFAULT_PROJECT_STATE_FILE,
  projectMarkers: Object.freeze([
    PROJECT_STATE_DIR,
    'work/verify.cmd',
    'work/verify.ps1',
    'work/verify.mjs',
    'work/verify.sh',
  ]),
  checkTimeoutMs: 120000,
  preStepThrottleMs: 5000,
  watchAutoRun: false,
  activationMode: ACTIVATION_MODES.AUTO,
  verifyCommand: null,
});

/**
 * @typedef {Object} PluginConfig
 * @property {string} [projectPhasesFile]
 * @property {string} [projectStateFile]
 * @property {string[]} [projectMarkers]
 * @property {number} [checkTimeoutMs]
 * @property {number} [preStepThrottleMs]
 * @property {boolean} [watchAutoRun]
 * @property {'auto'|'always'|'off'} [activationMode]
 * @property {string|null} [verifyCommand]
 */

/**
 * @typedef {Object} PhaseView
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} PhaseExit
 * @property {string[]} checks
 * @property {string[]} artifacts
 */

/**
 * @typedef {Object} PhaseDefinition
 * @property {string} id
 * @property {string} name
 * @property {PhaseExit} exit
 * @property {string[]} [commonPitfalls]
 */

/**
 * @typedef {Object} ProjectPhases
 * @property {number} version
 * @property {PhaseDefinition[]} phases
 * @property {Object[]} [supersedes]
 */

/**
 * @typedef {Object} DeferRecord
 * @property {string} reason
 * @property {string} by
 * @property {string} at
 * @property {string} [scope]
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string|null} from
 * @property {string} to
 * @property {string} at
 * @property {CheckResult[]} evidenceSnapshot
 * @property {DeferRecord|null} [defer]
 * @property {string} [reason]
 */

/**
 * @typedef {Object} ProjectState
 * @property {number} version
 * @property {string} declared
 * @property {HistoryEntry[]} history
 * @property {DeferRecord|null} [defer]
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} stage
 * @property {string} check
 * @property {number} exitCode
 * @property {'pass'|'fail'|'skip'|'error'|'timeout'} status
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} durationMs
 * @property {string} ranAt
 * @property {string} [command]
 */

/**
 * @typedef {Object} Blocker
 * @property {string} stage
 * @property {'check'|'artifact'} kind
 * @property {string} check
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} PhaseEvaluation
 * @property {number} version
 * @property {string|null} declared
 * @property {string|null} evidenced
 * @property {number} gap
 * @property {string|null} next
 * @property {Blocker[]} blockers
 * @property {boolean} deferred
 * @property {string|null} deferReason
 * @property {string} checkedAt
 */

/**
 * @typedef {Object} MlPhaseSnapshot
 * @property {number} version
 * @property {string} phaseId
 * @property {number} index
 * @property {PhaseView[]} phases
 * @property {string|null} evidenced
 * @property {number} gap
 * @property {string|null} next
 * @property {boolean} deferred
 * @property {string|null} deferReason
 * @property {boolean} stale
 * @property {string|null} staleAt
 * @property {HistoryEntryView[]} history
 * @property {{checks: string[], artifacts: string[], commonPitfalls: string[]}|null} nextExit
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} SnapshotSource
 * @property {string} kind
 * @property {string} form
 * @property {{name: string, text: string}[]} sections
 */

/**
 * @typedef {Object} MlPhaseProjection
 * @property {number} version
 * @property {string} phaseId
 * @property {number} index
 * @property {PhaseView[]} phases
 * @property {string|null} evidenced
 * @property {number} gap
 * @property {string|null} next
 * @property {boolean} deferred
 * @property {string|null} deferReason
 * @property {boolean} stale
 * @property {string|null} staleAt
 * @property {HistoryEntryView[]} history
 * @property {{checks: string[], artifacts: string[], commonPitfalls: string[]}|null} nextExit
 * @property {string} updatedAt
 */

export default Object.freeze({
  CONTRACT_VERSION,
  PHASES_VERSION,
  STATE_VERSION,
  EVALUATION_VERSION,
  SNAPSHOT_VERSION,
  PROJECTION_VERSION,
  PACKAGE_NAME,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  ACTIVATION_MODES,
  VERIFY_CANDIDATES,
  PROJECT_STATE_DIR,
  DEFAULT_PROJECT_PHASES_FILE,
  DEFAULT_PROJECT_STATE_FILE,
  PACKAGED_DEFAULT_PHASES_FILE,
  PROJECTION_KEY,
  ACTIVATION_PROJECTION_KEY,
  SNAPSHOT_SOURCE_KIND,
  SNAPSHOT_FORM,
  DOCK_SLOT,
  DOCK_ID,
  DOCK_ORDER,
  LOCALE_NAMESPACE,
  TOOL_NAMES,
  PHASE_IDS,
  CHECK_EXIT,
  CHECK_STATUS,
  ERROR_CODES,
  DEFAULT_CONFIG,
});



