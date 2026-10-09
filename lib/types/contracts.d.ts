/**
 * Frozen P0 TypeScript contracts for dsh-plugin-ml-phase-gate.
 *
 * These declarations mirror lib/contracts.js. They are intentionally
 * dependency-free so host-half, projection, and client-half code can share a
 * single vocabulary before a build toolchain is introduced.
 */

export const CONTRACT_VERSION: 1;
export const PHASES_VERSION: 1;
export const STATE_VERSION: 1;
export const EVALUATION_VERSION: 1;
export const SNAPSHOT_VERSION: 4;
export const PROJECTION_VERSION: 4;
export const PACKAGE_NAME: 'dsh-plugin-ml-phase-gate';
export const PLUGIN_NAME: 'ml-phase-gate';
export const PLUGIN_VERSION: '0.1.0';
export const ACTIVATION_MODES: { readonly AUTO: 'auto'; readonly ALWAYS: 'always'; readonly OFF: 'off' };
export const VERIFY_CANDIDATES: readonly ['work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh'];
export const PROJECT_STATE_DIR: '.dsh-ml-phase';
export const DEFAULT_PROJECT_PHASES_FILE: '.dsh-ml-phase/phases.yml';
export const DEFAULT_PROJECT_STATE_FILE: '.dsh-ml-phase/state.json';
export const PACKAGED_DEFAULT_PHASES_FILE: 'phases.default.yml';
export const PROJECTION_KEY: 'mlPhase';
export const ACTIVATION_PROJECTION_KEY: 'mlPhaseActivation';
export const SNAPSHOT_SOURCE_KIND: 'ml-phase-gate';
export const SNAPSHOT_FORM: 'snapshot';
export const DOCK_SLOT: 'conversation.input.dock';
export const DOCK_ID: 'ml-phase';
export const DOCK_ORDER: 5;
export const LOCALE_NAMESPACE: 'mlPhase';
export const TOOL_NAMES: { readonly STATUS: 'ml_phase_status'; readonly ADVANCE: 'ml_phase_advance'; readonly DEFER: 'ml_phase_defer'; readonly PHASES: 'ml_phase_phases' };
export const CHECK_EXIT: { readonly PASS: 0; readonly FAIL: 1; readonly SKIP: 2 };
export const CHECK_STATUS: { readonly PASS: 'pass'; readonly FAIL: 'fail'; readonly SKIP: 'skip'; readonly ERROR: 'error'; readonly TIMEOUT: 'timeout' };
export const ERROR_CODES: { readonly NO_PROJECT_ROOT: 'E_NO_PROJECT_ROOT'; readonly PHASES_INVALID: 'E_PHASES_INVALID'; readonly UNKNOWN_CHECK: 'E_UNKNOWN_CHECK'; readonly STATE_CORRUPT: 'E_STATE_CORRUPT'; readonly CHECK_FAILED: 'E_CHECK_FAILED'; readonly CHECK_TIMEOUT: 'E_CHECK_TIMEOUT'; readonly ARTIFACT_MISSING: 'E_ARTIFACT_MISSING'; readonly WRITE_CONFLICT: 'E_WRITE_CONFLICT'; readonly DEFERRED: 'E_DEFERRED'; readonly PROJECTION_MISSING: 'E_PROJECTION_MISSING'; readonly SNAPSHOT_INVALID: 'E_SNAPSHOT_INVALID'; readonly INVALID_TRANSITION: 'E_INVALID_TRANSITION'; readonly PROJECT_ROOT_FORBIDDEN: 'E_PROJECT_ROOT_FORBIDDEN' };
export const DEFAULT_CONFIG: { readonly projectPhasesFile: '.dsh-ml-phase/phases.yml'; readonly projectStateFile: '.dsh-ml-phase/state.json'; readonly projectMarkers: readonly ['.dsh-ml-phase', 'work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh']; readonly checkTimeoutMs: 120000; readonly preStepThrottleMs: 5000; readonly watchAutoRun: false; readonly activationMode: 'auto'; readonly verifyCommand: null };

export type PhaseId = string;
export type ToolName = 'ml_phase_status' | 'ml_phase_advance' | 'ml_phase_defer' | 'ml_phase_phases';
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'error' | 'timeout';
export type ActivationMode = 'auto' | 'always' | 'off';

export interface PluginConfig {
  projectPhasesFile?: string;
  projectStateFile?: string;
  projectMarkers?: string[];
  checkTimeoutMs?: number;
  preStepThrottleMs?: number;
  watchAutoRun?: boolean;
  activationMode?: ActivationMode;
  verifyCommand?: string | null;
}

export interface PhaseView {
  id: PhaseId;
  name: string;
}

export interface PhaseExit {
  checks: string[];
  artifacts: string[];
}

export interface PhaseDefinition {
  id: PhaseId;
  name: string;
  exit: PhaseExit;
  commonPitfalls?: string[];
}

export interface ProjectPhases {
  version: number;
  phases: PhaseDefinition[];
  supersedes?: SupersedesRecord[];
}

export interface SupersedesRecord {
  source: string;
  replacedBy: string;
  reason: string;
  at: string;
}

export interface DeferRecord {
  reason: string;
  by: string;
  at: string;
  scope?: string;
}

export interface HistoryEntry {
  from: PhaseId | null;
  to: PhaseId;
  at: string;
  evidenceSnapshot: CheckResult[];
  defer?: DeferRecord | null;
  reason?: string;
}

export interface ProjectState {
  version: number;
  declared: PhaseId;
  history: HistoryEntry[];
  defer?: DeferRecord | null;
}

export interface CheckResult {
  stage: PhaseId;
  check: string;
  exitCode: number;
  status: CheckStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  ranAt: string;
  command?: string;
}

export interface Blocker {
  stage: PhaseId;
  kind: 'check' | 'artifact';
  check: string;
  code: string;
  message: string;
}

export interface PhaseEvaluation {
  version: number;
  declared: PhaseId | null;
  evidenced: PhaseId | null;
  gap: number;
  next: PhaseId | null;
  blockers: Blocker[];
  deferred: boolean;
  deferReason: string | null;
  checkedAt: string;
}

export interface PhaseExitView {
  checks: string[];
  artifacts: string[];
  commonPitfalls: string[];
}

export interface HistoryEvidenceView {
  stage: string;
  check: string;
  status: string;
  exitCode: number;
}

export interface HistoryEntryView {
  from: PhaseId | null;
  to: PhaseId;
  at: string;
  reason: string | null;
  deferReason: string | null;
  evidence: HistoryEvidenceView[];
}

export interface MlPhaseSnapshot {
  version: number;
  phaseId: PhaseId;
  index: number;
  phases: PhaseView[];
  evidenced: PhaseId | null;
  gap: number;
  next: PhaseId | null;
  deferred: boolean;
  deferReason: string | null;
  stale: boolean;
  staleAt: string | null;
  history: HistoryEntryView[];
  nextExit: PhaseExitView | null;
  updatedAt: string;
}

export interface SnapshotSource {
  kind: 'ml-phase-gate';
  form: 'snapshot';
  sections: Array<{ name: string; text: string }>;
}

export interface MlPhaseProjection {
  version: number;
  phaseId: PhaseId;
  index: number;
  phases: PhaseView[];
  evidenced: PhaseId | null;
  gap: number;
  next: PhaseId | null;
  deferred: boolean;
  deferReason: string | null;
  stale: boolean;
  staleAt: string | null;
  history: HistoryEntryView[];
  nextExit: PhaseExitView | null;
  updatedAt: string;
}



