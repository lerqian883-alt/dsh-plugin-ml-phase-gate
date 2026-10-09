window.__ModuleLoader__.load({
  id: "dsh-plugin-ml-phase-gate",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { StateDot, Tooltip, Tag } = primitives;
    const NS = "mlPhase";
    const AUDIT_TAB_ID = "dsh-plugin-ml-phase-gate/audit";
    const AUDIT_TAB_KIND = "ml-phase-audit";
    const ACTIVATION_MODES = Object.freeze({ AUTO: "auto", ALWAYS: "always", OFF: "off" });
    const h = React.createElement;

    const zh = {
      "dock.aria": "机器学习阶段",
      "dock.expand": "展开阶段详情",
      "dock.collapse": "收起阶段详情",
      "dock.details": "阶段详情",
      "audit.open": "打开审计",
      "audit.title": "ML 阶段审计",
      "audit.description": "查看阶段游标、证据缺口和下一出口",
      "audit.empty": "当前会话还没有阶段投影。",
      "audit.summary": "当前状态",
      "audit.phases": "阶段清单",
      "audit.nextExit": "下一出口",
      "audit.defer": "人工覆盖",
      "audit.updatedAt": "更新时间",
      "audit.history": "历史回迁",
      "audit.historyEmpty": "暂无迁移记录",
      "status.notStarted": "未开始",
      "status.declared": "声明",
      "status.evidence": "证据",
      "status.gap": "差距",
      "status.next": "下一步",
      "status.stale": "数据可能过期",
      "status.staleAt": "过期时间",
      "status.refresh": "刷新",
      "status.refreshHint": "运行 ml_phase_status 刷新",
      "status.defer": "人工覆盖",
      "status.checks": "检查",
      "status.artifacts": "工件",
      "status.pitfalls": "常见坑",
      "status.none": "无",
      "node.done": "已完成",
      "node.evidence": "证据到此",
      "node.declared": "声明在此",
      "node.next": "下一阶段",
      "node.upcoming": "未开始",
      "node.gap": "证据缺口",
    };

    const en = {
      "dock.aria": "ML phase",
      "dock.expand": "Show phase details",
      "dock.collapse": "Hide phase details",
      "dock.details": "Phase details",
      "audit.open": "Open audit",
      "audit.title": "ML phase audit",
      "audit.description": "Review cursors, evidence gaps, and the next exit",
      "audit.empty": "This session has no phase projection yet.",
      "audit.summary": "Current state",
      "audit.phases": "Phase list",
      "audit.nextExit": "Next exit",
      "audit.defer": "Override",
      "audit.updatedAt": "Updated",
      "audit.history": "History",
      "audit.historyEmpty": "No transitions recorded",
      "status.notStarted": "Not started",
      "status.declared": "Declared",
      "status.evidence": "Evidence",
      "status.gap": "Gap",
      "status.next": "Next",
      "status.stale": "Possibly stale",
      "status.staleAt": "Stale at",
      "status.refresh": "Refresh",
      "status.refreshHint": "Run ml_phase_status to refresh",
      "status.defer": "Defer",
      "status.checks": "Checks",
      "status.artifacts": "Artifacts",
      "status.pitfalls": "Pitfalls",
      "status.none": "None",
      "node.done": "Done",
      "node.evidence": "Evidenced here",
      "node.declared": "Declared here",
      "node.next": "Next phase",
      "node.upcoming": "Upcoming",
      "node.gap": "Evidence gap",
    };

    const CONFIG_KEYS = new Set([
      "projectPhasesFile",
      "projectStateFile",
      "projectMarkers",
      "checkTimeoutMs",
      "preStepThrottleMs",
      "watchAutoRun",
      "activationMode",
      "verifyCommand",
    ]);

    function requireSafeRelativePath(value, field) {
      if (typeof value !== "string" || value.length === 0) throw new TypeError(`${field} must be a non-empty string`);
      if (value.includes("\0")) throw new TypeError(`${field} must not contain NUL`);
      if (/^[A-Za-z]:/.test(value) || /^[\\/]{2}/.test(value) || value.startsWith("/")) throw new TypeError(`${field} must be project-relative`);
      for (const segment of value.split(/[\\/]+/)) {
        if (!segment || segment === "." || segment === "..") throw new TypeError(`${field} must not contain empty, '.' or '..' segments`);
      }
      return value;
    }

    function validateClientConfig(config) {
      if (config == null) return;
      if (typeof config !== "object" || Array.isArray(config)) throw new TypeError("plugin config must be a plain object");
      for (const key of Object.keys(config)) {
        if (!CONFIG_KEYS.has(key)) throw new TypeError(`unknown plugin config key: ${key}`);
      }
      if (config.projectPhasesFile !== undefined) requireSafeRelativePath(config.projectPhasesFile, "projectPhasesFile");
      if (config.projectStateFile !== undefined) requireSafeRelativePath(config.projectStateFile, "projectStateFile");
      if (config.verifyCommand !== undefined) requireSafeRelativePath(config.verifyCommand, "verifyCommand");
      if (config.projectMarkers !== undefined) {
        if (!Array.isArray(config.projectMarkers) || config.projectMarkers.length === 0) throw new TypeError("projectMarkers must be a non-empty array");
        config.projectMarkers.forEach((marker, index) => requireSafeRelativePath(marker, `projectMarkers[${index}]`));
      }
      for (const field of ["checkTimeoutMs", "preStepThrottleMs"]) {
        if (config[field] !== undefined && (!Number.isSafeInteger(config[field]) || config[field] < 0)) throw new TypeError(`${field} must be a non-negative safe integer`);
      }
      if (config.watchAutoRun !== undefined && typeof config.watchAutoRun !== "boolean") throw new TypeError("watchAutoRun must be a boolean");
    }

    function activationModeOf(config) {
      validateClientConfig(config);
      const mode = config?.activationMode === undefined ? ACTIVATION_MODES.AUTO : config.activationMode;
      if (!Object.values(ACTIVATION_MODES).includes(mode)) {
        throw new TypeError("activationMode must be one of: auto, always, off");
      }
      return mode;
    }

    function useActivationMode(useProjection) {
      if (typeof useProjection !== "function") return ACTIVATION_MODES.AUTO;
      const activation = useProjection("mlPhaseActivation");
      const mode = activation?.mode;
      return mode === ACTIVATION_MODES.ALWAYS ? ACTIVATION_MODES.ALWAYS : ACTIVATION_MODES.AUTO;
    }

    function translate(t, key) {
      return typeof t === "function" ? t(key) : key;
    }

    function buildRailModel(phase) {
      if (!phase || !Array.isArray(phase.phases)) return null;
      const evidencedIndex = phase.evidenced
        ? phase.phases.findIndex((item) => item.id === phase.evidenced)
        : -1;
      const declaredIndex = Number.isSafeInteger(phase.index) ? phase.index : -1;
      const nextIndex = phase.next
        ? phase.phases.findIndex((item) => item.id === phase.next)
        : -1;
      return phase.phases.map((item, index) => {
        const evidenced = index <= evidencedIndex;
        const declared = index === declaredIndex;
        const gap = evidencedIndex >= 0 && index > evidencedIndex && index <= declaredIndex;
        const next = index === nextIndex;
        let state = evidenced ? "done" : next ? "ongoing" : "idle";
        if (gap) state = "error";
        return { id: item.id, name: item.name, state, evidenced, declared, gap, next };
      });
    }

    function nodeLabel(node, t) {
      if (node.gap) return `${node.id} · ${node.name} · ${translate(t, "node.gap")}`;
      if (node.declared) return `${node.id} · ${node.name} · ${translate(t, "node.declared")}`;
      if (node.next) return `${node.id} · ${node.name} · ${translate(t, "node.next")}`;
      if (node.evidenced) return `${node.id} · ${node.name} · ${translate(t, "node.done")}`;
      return `${node.id} · ${node.name} · ${translate(t, "node.upcoming")}`;
    }

    const dockStyle = {
      boxSizing: "border-box",
      width: "calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px))",
      margin: "0 auto",
      position: "relative",
    };

    const barStyle = {
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "calc(var(--dsh-composer-card-max-width, 100%) - 4 * var(--dsh-composer-dock-inset, 0px))",
      minHeight: 36,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px 4px 12px",
      borderRadius: "var(--dsw-radius-md, 8px)",
      background: "var(--dsw-specific-menu, transparent)",
      backdropFilter: "var(--dsw-menu-backdrop-filter, none)",
      border: "1px solid var(--dsw-alias-border-l1, transparent)",
      boxShadow: "var(--dsw-elevation-panel, none)",
      color: "var(--dsw-alias-label-primary, currentColor)",
      margin: "0 auto",
    };

    const trackStyle = {
      display: "flex",
      alignItems: "center",
      gap: 2,
      minWidth: 120,
      flex: "1 1 240px",
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "thin",
    };

    const separatorStyle = {
      width: 14,
      height: 1,
      flex: "none",
      background: "var(--dsw-alias-border-l2, transparent)",
    };

    const popoverStyle = {
      position: "absolute",
      bottom: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "calc(100vw - 32px)",
      boxSizing: "border-box",
      padding: 12,
      borderRadius: "var(--dsw-radius-md, 8px)",
      background: "var(--dsw-specific-menu, transparent)",
      border: "1px solid var(--dsw-alias-border-l1, transparent)",
      boxShadow: "var(--dsw-elevation-panel, none)",
      color: "var(--dsw-alias-label-primary, currentColor)",
      zIndex: 20,
      fontSize: 12,
      lineHeight: 1.6,
    };

    const auditRootStyle = {
      boxSizing: "border-box",
      width: "100%",
      height: "100%",
      padding: 16,
      overflow: "auto",
      color: "var(--dsw-alias-label-primary, currentColor)",
      background: "var(--dsw-alias-bg-base, transparent)",
    };

    const auditSectionStyle = {
      border: "1px solid var(--dsw-alias-border-l1, transparent)",
      borderRadius: "var(--dsw-radius-md, 8px)",
      background: "var(--dsw-specific-menu, transparent)",
      padding: 12,
      marginBottom: 12,
    };

    const auditSummaryStyle = {
      display: "grid",
      gridTemplateColumns: "minmax(72px, auto) 1fr",
      gap: "6px 12px",
      fontSize: 12,
      lineHeight: 1.5,
    };

    const auditRowStyle = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 0",
      borderBottom: "1px solid var(--dsw-alias-border-l1, transparent)",
    };

    const auditTitleStyle = {
      margin: "0 0 10px",
      fontSize: 14,
      lineHeight: 1.4,
      color: "var(--dsw-alias-label-primary, currentColor)",
    };

    function auditStatusLabel(node, t) {
      if (node.gap) return translate(t, "node.gap");
      if (node.declared) return translate(t, "node.declared");
      if (node.next) return translate(t, "node.next");
      if (node.evidenced) return translate(t, "node.done");
      return translate(t, "node.upcoming");
    }

    function AuditSummaryRow(label, value) {
      return [
        h("span", { key: `label-${label}`, style: { color: "var(--dsw-alias-label-tertiary, currentColor)" } }, label),
        h("span", { key: `value-${label}`, style: { minWidth: 0, overflowWrap: "anywhere" } }, value),
      ];
    }

    function MlPhaseAudit({ useProjection, t, activationMode = ACTIVATION_MODES.AUTO }) {
      if (typeof useProjection !== "function") return null;
      const phase = useProjection("mlPhase");
      if (phase === void 0 && activationMode !== ACTIVATION_MODES.ALWAYS) return null;
      if (phase === null || phase === void 0) {
        if (activationMode === ACTIVATION_MODES.AUTO) return null;
        return h("div", {
          "data-ml-phase-audit": true,
          "data-audit-state": "empty",
          role: "region",
          "aria-label": translate(t, "audit.title"),
          style: auditRootStyle,
        }, h("p", { style: { margin: 0, color: "var(--dsw-alias-label-secondary, currentColor)" } }, translate(t, "audit.empty")));
      }
      const nodes = buildRailModel(phase) || [];
      const summaryRows = [
        AuditSummaryRow(translate(t, "status.declared"), phase.phaseId),
        AuditSummaryRow(translate(t, "status.evidence"), phase.evidenced ?? translate(t, "status.none")),
        AuditSummaryRow(translate(t, "status.gap"), String(phase.gap)),
        AuditSummaryRow(translate(t, "status.next"), phase.next ?? translate(t, "status.none")),
        AuditSummaryRow(translate(t, "status.stale"), phase.stale ? (phase.staleAt ?? translate(t, "status.refreshHint")) : translate(t, "status.none")),
        AuditSummaryRow(translate(t, "status.defer"), phase.deferred ? (phase.deferReason ?? translate(t, "status.defer")) : translate(t, "status.none")),
        AuditSummaryRow(translate(t, "audit.updatedAt"), phase.updatedAt),
      ];
      const rows = nodes.map((node) => h("div", {
        key: node.id,
        "data-ml-phase-audit-row": node.id,
        role: "listitem",
        tabIndex: 0,
        "aria-label": `${node.id} · ${node.name} · ${auditStatusLabel(node, t)}`,
        onKeyDown: (event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const parent = event.currentTarget?.parentElement;
          const peers = parent ? Array.from(parent.querySelectorAll("[data-ml-phase-audit-row]")) : [];
          const current = peers.indexOf(event.currentTarget);
          if (current < 0 || peers.length === 0) return;
          const target = event.key === "Home" ? 0 : event.key === "End" ? peers.length - 1 : event.key === "ArrowUp" ? (current - 1 + peers.length) % peers.length : (current + 1) % peers.length;
          peers[target]?.focus?.();
        },
        style: { ...auditRowStyle, borderBottom: node.id === nodes[nodes.length - 1]?.id ? "none" : auditRowStyle.borderBottom },
      },
        h(StateDot, { state: node.state, appearance: "step", size: 18 }),
        h("span", { style: { width: 34, flex: "none", fontSize: 12, color: "var(--dsw-alias-label-secondary, currentColor)" } }, node.id),
        h("span", { style: { minWidth: 0, flex: 1, fontSize: 13, overflowWrap: "anywhere" } }, node.name),
        h(Tag, { tone: node.gap ? "danger" : node.declared ? "info" : node.next ? "success" : node.evidenced ? "neutral" : "outline" }, auditStatusLabel(node, t)),
      ));
      const nextExit = phase.nextExit ? h("div", { style: auditSectionStyle, role: "group", "aria-label": translate(t, "audit.nextExit") },
        h("h3", { style: auditTitleStyle }, translate(t, "audit.nextExit")),
        h("div", { style: auditSummaryStyle },
          ...AuditSummaryRow(translate(t, "status.checks"), phase.nextExit.checks.length ? phase.nextExit.checks.join(", ") : translate(t, "status.none")),
          ...AuditSummaryRow(translate(t, "status.artifacts"), phase.nextExit.artifacts.length ? phase.nextExit.artifacts.join(", ") : translate(t, "status.none")),
          ...AuditSummaryRow(translate(t, "status.pitfalls"), phase.nextExit.commonPitfalls.length ? phase.nextExit.commonPitfalls.join("; ") : translate(t, "status.none")),
        ),
      ) : null;
      const historyEntries = Array.isArray(phase.history) ? [...phase.history].reverse() : [];
      const historyRows = historyEntries.map((entry, index) => h("div", {
        key: `${entry.at}-${index}`,
        role: "listitem",
        style: { ...auditRowStyle, alignItems: "flex-start", borderBottom: index === historyEntries.length - 1 ? "none" : auditRowStyle.borderBottom },
      }, h("div", { style: { minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } },
        h("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-primary, currentColor)" } }, `${entry.from ?? "∅"} → ${entry.to}`),
        h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, currentColor)" } }, entry.at),
        entry.reason ? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, currentColor)" } }, entry.reason) : null,
        entry.deferReason ? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, currentColor)" } }, entry.deferReason) : null,
        entry.evidence?.length ? h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, currentColor)" } }, `${entry.evidence.length} checks`) : null,
      )));
      const historySection = h("div", {
        style: auditSectionStyle,
        role: "list",
        "aria-label": translate(t, "audit.history"),
      },
        h("h3", { style: auditTitleStyle }, translate(t, "audit.history")),
        historyRows.length ? historyRows : h("p", { style: { margin: 0, color: "var(--dsw-alias-label-secondary, currentColor)" } }, translate(t, "audit.historyEmpty")),
      );
      return h("div", {
        "data-ml-phase-audit": true,
        "data-audit-state": "ready",
        role: "region",
        "aria-label": translate(t, "audit.title"),
        style: auditRootStyle,
      },
        h("div", { style: auditSectionStyle, role: "group", "aria-label": translate(t, "audit.summary") },
          h("h3", { style: auditTitleStyle }, translate(t, "audit.summary")),
          h("div", { style: auditSummaryStyle }, summaryRows.flat()),
        ),
        nextExit,
        historySection,
        h("div", { style: auditSectionStyle, role: "list", "aria-label": translate(t, "audit.phases") },
          h("h3", { style: auditTitleStyle }, translate(t, "audit.phases")),
          ...rows,
        ),
      );
    }

    function StageNode({ node, index, t }) {
      const anchor = h("span", {
        "data-stage-index": index,
        "data-phase-id": node.id,
        tabIndex: 0,
        "aria-label": nodeLabel(node, t),
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 4px",
          borderRadius: 999,
          boxShadow: node.declared ? "0 0 0 2px var(--dsw-alias-state-business-primary, currentColor)" : "none",
          flex: "none",
        },
      },
        h(StateDot, { state: node.state, appearance: "step", size: 18 }),
        h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, currentColor)" } }, node.id),
      );
      return h(Tooltip, { label: nodeLabel(node, t), side: "top", portal: true, delayMs: 300 }, anchor);
    }

    function DetailRow(label, value) {
      return h("div", { style: { display: "flex", gap: 8 } },
        h("span", { style: { flex: "0 0 72px", color: "var(--dsw-alias-label-tertiary, currentColor)" } }, label),
        h("span", { style: { minWidth: 0, color: "var(--dsw-alias-label-primary, currentColor)", overflowWrap: "anywhere" } }, value),
      );
    }

    function StageRail({ phase, t, openAudit }) {
      const buttonRef = React.useRef(null);
      const dialogRef = React.useRef(null);
      const [open, setOpen] = React.useState(false);
      const [hover, setHover] = React.useState(false);
      const visible = open || hover;
      const close = () => {
        setOpen(false);
        setHover(false);
        const buttonNode = buttonRef.current;
        if (buttonNode && typeof buttonNode.focus === "function") buttonNode.focus();
      };
      React.useEffect(() => {
        if (!visible || typeof document === "undefined") return undefined;
        const dialogNode = dialogRef.current;
        const onKeyDown = (event) => {
          if (event.key === "Escape") {
            close();
            return;
          }
          if (event.key === "Tab" && open && dialogNode?.contains?.(event.target)) {
            event.preventDefault();
            if (typeof dialogNode.focus === "function") dialogNode.focus();
          }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [visible, open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const dialogNode = dialogRef.current;
        if (dialogNode && typeof dialogNode.focus === "function") dialogNode.focus();
        return undefined;
      }, [open]);
      const nodes = buildRailModel(phase) || [];
      const children = [];
      nodes.forEach((node, index) => {
        if (index > 0) children.push(h("span", { key: `sep-${index}`, style: separatorStyle }));
        children.push(h(StageNode, { key: node.id, node, index, t }));
      });

      const summary = h("span", {
        style: {
          flex: "none",
          marginLeft: 8,
          color: "var(--dsw-alias-label-secondary, currentColor)",
          fontSize: 12,
          whiteSpace: "nowrap",
        },
      }, phase.phaseId);

      const badges = [];
      if (phase.stale) badges.push(h(Tag, { key: "stale", tone: "warning" }, translate(t, "status.stale")));
      if (phase.gap > 0) badges.push(h(Tag, { key: "gap", tone: "danger" }, `${translate(t, "status.gap")} ${phase.gap}`));
      if (phase.deferred) badges.push(h(Tag, { key: "defer", tone: "warning" }, translate(t, "status.defer")));
      if (phase.next) badges.push(h(Tag, { key: "next", tone: "info" }, `${translate(t, "status.next")} ${phase.next}`));

      const button = h("button", {
        type: "button",
        "aria-expanded": visible,
        "aria-label": visible ? translate(t, "dock.collapse") : translate(t, "dock.expand"),
        ref: buttonRef,
        onClick: () => { if (open) close(); else setOpen(true); },
        style: {
          flex: "none",
          border: "none",
          background: "transparent",
          color: "var(--dsw-alias-label-tertiary, currentColor)",
          cursor: "pointer",
          fontSize: 12,
          padding: "2px 4px",
        },
      }, visible ? translate(t, "dock.collapse") : translate(t, "dock.expand"));

      const auditButton = typeof openAudit === "function" ? h("button", {
        type: "button",
        onClick: openAudit,
        style: {
          flex: "none",
          border: "none",
          background: "transparent",
          color: "var(--dsw-alias-label-tertiary, currentColor)",
          cursor: "pointer",
          fontSize: 12,
          padding: "2px 4px",
        },
      }, translate(t, "audit.open")) : null;
      const bar = h("div", { style: barStyle },
        h("div", { "data-stage-track": true, style: trackStyle }, children),
        summary,
        h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" } }, badges),
        button,
        auditButton,
      );

      const details = visible ? h("div", { ref: dialogRef, tabIndex: 0, role: "dialog", "aria-label": translate(t, "dock.details"), style: popoverStyle },
        DetailRow(translate(t, "status.declared"), phase.phaseId),
        DetailRow(translate(t, "status.evidence"), phase.evidenced ?? translate(t, "status.none")),
        DetailRow(translate(t, "status.gap"), String(phase.gap)),
        DetailRow(translate(t, "status.next"), phase.next ?? translate(t, "status.none")),
        phase.stale ? DetailRow(translate(t, "status.staleAt"), phase.staleAt ?? translate(t, "status.none")) : null,
        phase.stale ? DetailRow(translate(t, "status.refresh"), translate(t, "status.refreshHint")) : null,
        phase.nextExit ? DetailRow(translate(t, "status.checks"), phase.nextExit.checks?.join(", ") || translate(t, "status.none")) : null,
        phase.nextExit ? DetailRow(translate(t, "status.artifacts"), phase.nextExit.artifacts?.join(", ") || translate(t, "status.none")) : null,
        phase.nextExit?.commonPitfalls?.length ? DetailRow(translate(t, "status.pitfalls"), phase.nextExit.commonPitfalls.join("; ")) : null,
        phase.deferred ? DetailRow(translate(t, "status.defer"), phase.deferReason ?? translate(t, "status.defer")) : null,
      ) : null;

      return h("div", {
        "data-stage-rail": true,
        role: "group",
        "aria-label": translate(t, "dock.aria"),
        style: dockStyle,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
      }, bar, details);
    }

    function MlPhaseDock({ useProjection, t, openAudit, activationMode = ACTIVATION_MODES.AUTO }) {
      if (typeof useProjection !== "function") return null;
      const phase = useProjection("mlPhase");
      if (phase === void 0 && activationMode !== ACTIVATION_MODES.ALWAYS) return null;
      if (phase === null || phase === void 0) {
        if (activationMode === ACTIVATION_MODES.AUTO) return null;
        return h("div", {
          "data-stage-rail": true,
          role: "group",
          "aria-label": translate(t, "dock.aria"),
          style: dockStyle,
        }, h("div", { style: barStyle },
          h(StateDot, { state: "idle", appearance: "step", size: 18 }),
          h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, currentColor)" } }, translate(t, "status.notStarted")),
        ));
      }
      return h(StageRail, { phase, t, openAudit });
    }

    function localeText(ctx, key) {
      const locale = ctx?.locale;
      const t = typeof locale?.bind === "function" ? locale.bind(NS) : null;
      return translate(t, key);
    }

    function openAuditTab(ctx) {
      const service = ctx?.sidebarRight;
      if (typeof service?.openTab !== "function") return;
      const mounted = service.mounted?.getSnapshot?.();
      if (mounted == null) return;
      service.openTab(AUDIT_TAB_KIND);
    }

    function registerAudit(ctx, fallbackActivationMode) {
      if (typeof ctx?.sidebarRightTabs?.register !== "function") return;
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: AUDIT_TAB_ID,
        kind: AUDIT_TAB_KIND,
        priority: "extension",
        title: () => localeText(ctx, "audit.title"),
        guide: [{
          id: "open",
          order: 30,
          title: () => localeText(ctx, "audit.title"),
          description: () => localeText(ctx, "audit.description"),
        }],
      }), "ml-phase-gate:audit-tab-type");
      ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: AUDIT_TAB_ID,
        locale: NS,
      }, (props) => MlPhaseAudit({ ...props, activationMode: useActivationMode(props.useProjection) })));
    }
    function apply(ctx, config) {
      const activationMode = activationModeOf(config);
      if (activationMode === ACTIVATION_MODES.OFF) return;
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ml-phase-gate:locale");
      const auditInjection = typeof ctx.sidebarRight?.openTab === "function" ? {
        inject: () => {
          const mounted = ctx.sidebarRight?.mounted?.getSnapshot?.();
          return mounted == null ? {} : { openAudit: () => openAuditTab(ctx) };
        },
      } : {};
      ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
        name: "conversation.input.dock",
        id: "ml-phase",
        order: 5,
        locale: NS,
        ...auditInjection,
      }, (props) => MlPhaseDock({ ...props, activationMode: useActivationMode(props.useProjection) })));
      registerAudit(ctx, activationMode);
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "sidebarRight", "sidebarRightTabs"];
    exports.__test = { buildRailModel, StageRail, MlPhaseDock, MlPhaseAudit, AUDIT_TAB_ID, AUDIT_TAB_KIND, ACTIVATION_MODES, activationModeOf, useActivationMode, dictionaries: { zh, en } };
    return exports;
  },
});


