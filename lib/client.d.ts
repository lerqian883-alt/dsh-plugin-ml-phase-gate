import type { ReactElement } from 'react';

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
  from: string | null;
  to: string;
  at: string;
  reason: string | null;
  deferReason: string | null;
  evidence: HistoryEvidenceView[];
}

export interface MlPhaseView {
  version: number;
  phaseId: string;
  index: number;
  phases: Array<{ id: string; name: string }>;
  evidenced: string | null;
  gap: number;
  next: string | null;
  deferred: boolean;
  deferReason: string | null;
  stale: boolean;
  staleAt: string | null;
  history: HistoryEntryView[];
  nextExit: PhaseExitView | null;
  updatedAt: string;
}

export type ActivationMode = 'auto' | 'always' | 'off';

export interface MlPhaseDockProps {
  useProjection: (key: 'mlPhase') => MlPhaseView | null | undefined;
  t: (key: string) => string;
  openAudit?: () => void;
  activationMode?: ActivationMode;
}

export interface MlPhaseAuditProps {
  useProjection: (key: 'mlPhase') => MlPhaseView | null | undefined;
  t: (key: string) => string;
  activationMode?: ActivationMode;
}

export interface SidebarRightTabsService {
  register(definition: {
    id: string;
    kind: string;
    priority?: 'extension' | 'builtin' | 'fallback';
    title?: () => string;
    guide?: Array<{ id: string; order: number; title: () => string; description?: () => string }>;
  }): () => void;
}

export interface SidebarRightService {
  openTab(kind: string, options?: Record<string, unknown>): void;
  mounted?: { getSnapshot: () => unknown };
}

export function apply(ctx: {
  effect: (fn: () => unknown, label: string) => unknown;
  locale: {
    register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => unknown;
    bind?: (namespace: string) => (key: string) => string;
  };
  slots: {
    inject: (slot: string, callback: () => unknown) => unknown;
    register: (options: Record<string, unknown>, component: (props: MlPhaseDockProps & MlPhaseAuditProps) => ReactElement | null) => unknown;
  };
  sidebarRight?: SidebarRightService;
  sidebarRightTabs?: SidebarRightTabsService;
}, config?: { activationMode?: ActivationMode; [key: string]: unknown }): void;

export const inject: readonly ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];