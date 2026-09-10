import {
  defineContract,
  defineSettingsContract,
  type RpcOutput,
  type CustomPillState,
} from "paseo-plugin-helper/shared";
import { z } from "zod";

export type { CustomPillState };

export const ResourceFieldSchema = z.enum(["cpu", "memory", "load", "uptime", "branch", "mcp"]);
export type ResourceField = z.infer<typeof ResourceFieldSchema>;

export const McpServerStatusSchema = z.object({
  name: z.string(),
  status: z.enum(["healthy", "degraded", "down", "unknown"]),
  latencyMs: z.number(),
});
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;

export interface McpStatusSnapshot {
  updatedAt: string;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  servers: McpServerStatus[];
}

export const McpResourceStatusSchema = z.object({
  updatedAt: z.string(),
  total: z.number(),
  healthy: z.number(),
  degraded: z.number(),
  down: z.number(),
  isStale: z.boolean(),
  servers: z.array(McpServerStatusSchema),
});
export type McpResourceStatus = z.infer<typeof McpResourceStatusSchema>;

export const CustomPillStateSchema = z.object({
  id: z.string(),
  sourceFile: z.string().optional(),
  title: z.string(),
  compactTitle: z.string().optional(),
  icon: z.string().optional(),
  compactIcon: z.string().optional(),
  rawValue: z.string(),
  displayValue: z.string(),
  numericValue: z.number().optional(),
  status: z.enum(["neutral", "success", "warning", "danger", "accent", "info"]),
  lastUpdated: z.number(),
  error: z.string().optional(),
  modalTitle: z.string().optional(),
  modalDescription: z.string().optional(),
  modalOutput: z.string().optional(),
  modalError: z.string().optional(),
  modalLastUpdated: z.number().optional(),
});
export type CustomPillStateOutput = z.infer<typeof CustomPillStateSchema>;

export const getCustomPillsRpc = defineContract({
  name: "top.custom-pills.get",
  description: "Retrieve live states of all discovered custom metric pills",
  input: z.object({}).default({}),
  output: z.object({
    pills: z.array(CustomPillStateSchema),
  }),
});

export const runCustomPillModalCommandRpc = defineContract({
  name: "top.custom-pills.modal-command",
  description: "Execute the on-demand drilldown command for a custom metric pill",
  input: z.object({
    pillId: z.string(),
  }),
  output: z.object({
    output: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const CustomPillDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceFile: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CustomPillDefinition = z.infer<typeof CustomPillDefinitionSchema>;

export const listCustomPillsRpc = defineContract({
  name: "top.custom-pills.list",
  description: "List all discovered custom metric pill definitions",
  input: z.object({}).default({}),
  output: z.object({
    pills: z.array(CustomPillDefinitionSchema),
  }),
});

export const liveUsageSchema = z.object({
  inputTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
  contextWindowMaxTokens: z.number().optional(),
  contextWindowUsedTokens: z.number().optional(),
});
export type LiveUsage = z.infer<typeof liveUsageSchema>;

export const topTimelineTelemetrySchema = z.object({
  turnId: z.string().nullable(),
  agentId: z.string(),
  outcomeKind: z.enum(["completed", "failed", "canceled"]),
  outcomeError: z.string().optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
  cpuPercent: z.number(),
  memUsedBytes: z.number(),
  memTotalBytes: z.number(),
  memPercent: z.number(),
  loadAvg1m: z.number(),
  mcpHealthy: z.number().optional(),
  mcpTotal: z.number().optional(),
  mcpInstalled: z.boolean().optional(),
  mcpRunning: z.boolean().optional(),
  branch: z.string().nullable().optional(),
  worktree: z.string().nullable().optional(),
  agentTitle: z.string().nullable().optional(),
  agentModel: z.string().nullable().optional(),
  agentProvider: z.string().nullable().optional(),
  uptimeSeconds: z.number().optional(),
  gitInsertions: z.number().optional(),
  gitDeletions: z.number().optional(),
  gitFilesChanged: z.number().optional(),
  toolCalls: z.number().optional(),
  toolErrors: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  contextUsedTokens: z.number().optional(),
  contextMaxTokens: z.number().optional(),
  costUsd: z.number().optional(),
});
export type TopTimelineTelemetryData = z.infer<typeof topTimelineTelemetrySchema>;

export const TOP_TIMELINE_KIND = "top-turn-telemetry";
export const TOP_TIMELINE_VERSION = 1;

export const getSystemResourcesRpc = defineContract({
  name: "system-resources.get",
  description: "Retrieve real-time host system resource metrics (CPU, RAM, load, uptime)",
  input: z
    .object({
      directory: z.string().optional(),
      fields: z.array(ResourceFieldSchema).optional(),
    })
    .default({}),
  output: z.object({
    version: z.string(),
    hostname: z.string().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
    cpuModel: z.string().optional(),
    cpuCores: z.number().optional(),
    cpuUsagePercent: z.number().optional(),
    memoryUsedBytes: z.number().optional(),
    memoryTotalBytes: z.number().optional(),
    memoryUsedPercent: z.number().optional(),
    loadAvg: z.array(z.number()).optional(),
    uptimeSeconds: z.number().optional(),
    branch: z.string().nullable().optional(),
    mcp: McpResourceStatusSchema.nullable().optional(),
    mcpInstalled: z.boolean().optional(),
    mcpRunning: z.boolean().optional(),
    customPills: z.array(CustomPillStateSchema).optional(),
    lastTurn: topTimelineTelemetrySchema.nullable().optional(),
    liveUsage: liveUsageSchema.nullable().optional(),
  }),
});

export type SystemResources = RpcOutput<typeof getSystemResourcesRpc>;

export const PillModeSchema = z.enum(["cycle", "all", "multiple"]).default("cycle");
export type PillMode = z.infer<typeof PillModeSchema>;

export const SurfaceTargetSchema = z.enum(["pill", "timeline", "both", "none"]);
export type SurfaceTarget = z.infer<typeof SurfaceTargetSchema>;

export const MetricIdSchema = z.enum([
  "cpu_ram",
  "branch",
  "worktree",
  "agent_title",
  "agent",
  "agent_provider",
  "agent_activity",
  "agent_id",
  "load",
  "uptime",
  "mcp",
  "changes",
  "tokens",
  "tools",
]);
export type MetricId = z.infer<typeof MetricIdSchema>;

export const METRIC_IDS: readonly MetricId[] = [
  "cpu_ram",
  "branch",
  "worktree",
  "agent_title",
  "agent",
  "agent_provider",
  "agent_activity",
  "agent_id",
  "load",
  "uptime",
  "mcp",
  "changes",
  "tokens",
  "tools",
];

export const CORE_TIMELINE_METRICS: readonly MetricId[] = [
  "cpu_ram",
  "branch",
  "load",
  "mcp",
  "agent_id",
  "changes",
  "tokens",
];

export const DEFAULT_METRIC_SURFACES: Record<MetricId, SurfaceTarget> = {
  cpu_ram: "both",
  branch: "both",
  worktree: "pill",
  agent_id: "both",
  load: "both",
  uptime: "none",
  mcp: "both",
  agent_title: "none",
  agent: "none",
  agent_provider: "none",
  agent_activity: "none",
  changes: "timeline",
  tokens: "timeline",
  tools: "timeline",
};

export interface MetricDefinition {
  id: MetricId;
  title: string;
  description: string;
  icon: string;
  shortLabel?: string;
  core?: boolean;
  pillOnly?: boolean;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: "cpu_ram",
    title: "CPU & RAM",
    description: "Host CPU utilization and memory consumption",
    icon: "Cpu",
    core: true,
  },
  {
    id: "branch",
    title: "Git Branch",
    description: "Active Git branch in agent workspace",
    icon: "GitBranch",
    core: true,
  },
  {
    id: "load",
    title: "System Load",
    description: "1-minute host system load average",
    icon: "Activity",
    shortLabel: "load",
    core: true,
  },
  {
    id: "mcp",
    title: "MCP Server Health",
    description: "Connected MCP server count and status snapshots",
    icon: "Server",
    core: true,
  },
  {
    id: "agent_id",
    title: "Agent ID",
    description: "Agent session short ID",
    icon: "Hash",
    core: true,
  },
  {
    id: "worktree",
    title: "Worktree Location",
    description: "Workspace directory or worktree path",
    icon: "Folder",
  },
  {
    id: "agent",
    title: "Agent Model",
    description: "Active LLM model identifier",
    icon: "Bot",
  },
  {
    id: "agent_provider",
    title: "Agent Provider",
    description: "LLM provider name (e.g. anthropic, openai)",
    icon: "Globe",
  },
  {
    id: "agent_activity",
    title: "Agent Activity",
    description: "Live idle timer; timeline snapshots would freeze it",
    icon: "Clock",
    pillOnly: true,
  },
  {
    id: "agent_title",
    title: "Agent Title",
    description: "Agent tab display title",
    icon: "Tag",
  },
  {
    id: "uptime",
    title: "Host Uptime",
    description: "System running duration since boot",
    icon: "Power",
    shortLabel: "up",
  },
  {
    id: "changes",
    title: "Git Changes",
    description: "Per-turn git insertions, deletions, and files changed",
    icon: "GitCommitHorizontal",
    shortLabel: "Δ",
  },
  {
    id: "tokens",
    title: "Token Usage",
    description: "Live cumulative plus per-turn input/output tokens and context use",
    icon: "Coins",
    shortLabel: "tok",
  },
  {
    id: "tools",
    title: "Tool Calls",
    description: "Per-turn tool call and error counts",
    icon: "Wrench",
    shortLabel: "calls",
  },
];

export function isPillEnabled(target?: SurfaceTarget): boolean {
  return target === "pill" || target === "both";
}

export function isTimelineEnabled(target?: SurfaceTarget): boolean {
  return target === "timeline" || target === "both";
}

/**
 * Single presence-gated read point for the MCP metric surface. Every surface
 * (pill, timeline) resolves through here so uninstalled means invisible
 * everywhere with no per-call-site presence checks. Fail-closed: anything
 * other than positively installed (including unknown) resolves to off.
 */
/**
 * Surface visibility contract (single source of truth for pill and card):
 * selected + live data -> value; selected + not-yet-observed -> placeholder;
 * selected + known-dead source -> hidden on both surfaces; unselected -> hidden.
 * A disabled dependency is known-dead, never placeholder material.
 */
/**
 * Effective enabled state for one custom pill. Single decision point shared
 * by the server filter, the settings matrix, and the composer sync.
 */
export function customPillEffectiveEnabled(
  masterEnabled: boolean,
  overrides: Record<string, boolean> | undefined,
  pill: { id: string; enabled: boolean },
): boolean {
  if (!masterEnabled) return false;
  const override = overrides?.[pill.id];
  return override === undefined ? pill.enabled : override;
}

export function isSourceDead(
  id: MetricId,
  status: { mcpRunning?: boolean | null },
): boolean {
  if (id === "mcp") return status?.mcpRunning === false;
  return false;
}

export function isMcpSurfaceEnabled(
  settings: {
    metricSurfaces?: Partial<Record<MetricId, SurfaceTarget>>;
    showMcp?: boolean;
    mcp?: boolean;
  },
  surface: "pill" | "timeline",
  mcpInstalled?: boolean,
  mcpRunning?: boolean | null,
): boolean {
  if (mcpInstalled !== true) return false;
  if (mcpRunning === false) return false;
  if (surface === "pill") return legacyFlagView(settings).showMcp;
  const s = settings.metricSurfaces;
  if (!s) return true;
  return isTimelineEnabled(s["mcp"]);
}

export function targetFromCheckboxes(pill: boolean, timeline: boolean): SurfaceTarget {
  if (pill && timeline) return "both";
  if (pill) return "pill";
  if (timeline) return "timeline";
  return "none";
}

export function checkboxesFromTarget(target?: SurfaceTarget): { pill: boolean; timeline: boolean } {
  const t = target ?? "none";
  return {
    pill: t === "pill" || t === "both",
    timeline: t === "timeline" || t === "both",
  };
}

export function isCoreTimelineMetric(metricId: MetricId): boolean {
  return (CORE_TIMELINE_METRICS as readonly string[]).includes(metricId);
}

export const PROVIDER_DEPENDENT_METRICS: readonly MetricId[] = [
  "tokens",
];

export function isProviderDependent(metricId: MetricId): boolean {
  return (PROVIDER_DEPENDENT_METRICS as readonly string[]).includes(metricId);
}

/**
 * Where each metric renders. The gap test asserts every non-pillOnly metric
 * appears in at least one registry: offered-but-nowhere-visible is a bug.
 * Keep these in sync with PillItemContent cases (pill), the multiple-mode
 * desiredPills list (dedicated pills), and TopTimelineTelemetryCard rows
 * (timeline) in client/.
 */
export const PILL_RENDERED_METRICS: readonly MetricId[] = [...METRIC_IDS];

export const MULTIPLE_MODE_RENDERED_METRICS: readonly MetricId[] = [...METRIC_IDS];

export const TIMELINE_RENDERED_METRICS: readonly MetricId[] = [
  "cpu_ram",
  "load",
  "mcp",
  "agent_id",
  "agent_title",
  "agent",
  "agent_provider",
  "branch",
  "worktree",
  "uptime",
  "changes",
  "tokens",
  "tools",
];

export interface LegacyFlagView {
  showCpuRam: boolean;
  showBranch: boolean;
  showWorktree: boolean;
  showAgentTitle: boolean;
  showAgent: boolean;
  showAgentProvider: boolean;
  showAgentActivity: boolean;
  showAgentId: boolean;
  showLoad: boolean;
  showUptime: boolean;
  showMcp: boolean;
}

/**
 * Projects per-metric surface selectors back onto the legacy boolean flags
 * consumed by pill rendering. Selectors win when present; raw legacy flags
 * apply only to settings objects that predate migration.
 */
export function legacyFlagView(settings: {
  metricSurfaces?: Partial<Record<MetricId, SurfaceTarget>>;
  showCpuRam?: boolean;
  showBranch?: boolean;
  showWorktree?: boolean;
  showAgentTitle?: boolean;
  showAgent?: boolean;
  showAgentProvider?: boolean;
  showAgentActivity?: boolean;
  showAgentId?: boolean;
  showLoad?: boolean;
  showUptime?: boolean;
  showMcp?: boolean;
  mcp?: boolean;
}): LegacyFlagView {
  const s = settings.metricSurfaces;
  if (!s) {
    return {
      showCpuRam: settings.showCpuRam ?? true,
      showBranch: settings.showBranch ?? true,
      showWorktree: settings.showWorktree ?? true,
      showAgentTitle: settings.showAgentTitle ?? false,
      showAgent: settings.showAgent ?? false,
      showAgentProvider: settings.showAgentProvider ?? false,
      showAgentActivity: settings.showAgentActivity ?? false,
      showAgentId: settings.showAgentId ?? true,
      showLoad: settings.showLoad ?? false,
      showUptime: settings.showUptime ?? false,
      showMcp: settings.showMcp ?? settings.mcp ?? true,
    };
  }
  const pill = (id: MetricId): boolean => isPillEnabled(s[id]);
  return {
    showCpuRam: pill("cpu_ram"),
    showBranch: pill("branch"),
    showWorktree: pill("worktree"),
    showAgentTitle: pill("agent_title"),
    showAgent: pill("agent"),
    showAgentProvider: pill("agent_provider"),
    showAgentActivity: pill("agent_activity"),
    showAgentId: pill("agent_id"),
    showLoad: pill("load"),
    showUptime: pill("uptime"),
    showMcp: pill("mcp"),
  };
}

/**
 * Migrates legacy boolean toggles and single recordTurnTelemetry switch into the
 * per-metric SurfaceTarget model: Record<MetricId, "pill" | "timeline" | "both" | "none">.
 */
export function migrateLegacyMetricSurfaces(raw: Record<string, unknown>): Record<MetricId, SurfaceTarget> {
  if (raw.metricSurfaces && typeof raw.metricSurfaces === "object") {
    const custom = raw.metricSurfaces as Partial<Record<MetricId, SurfaceTarget>>;
    const resolved: Record<MetricId, SurfaceTarget> = { ...DEFAULT_METRIC_SURFACES };
    for (const id of METRIC_IDS) {
      if (custom[id] && SurfaceTargetSchema.safeParse(custom[id]).success) {
        resolved[id] = custom[id]!;
      }
    }
    return resolved;
  }

  const hasLegacyKey =
    "recordTurnTelemetry" in raw ||
    "showCpuRam" in raw ||
    "showBranch" in raw ||
    "showWorktree" in raw ||
    "showAgentId" in raw ||
    "showLoad" in raw ||
    "showUptime" in raw ||
    "showMcp" in raw ||
    "mcp" in raw ||
    "showAgentTitle" in raw ||
    "showAgent" in raw ||
    "showAgentProvider" in raw ||
    "showAgentActivity" in raw;

  if (!hasLegacyKey) {
    return { ...DEFAULT_METRIC_SURFACES };
  }

  const singleSwitch = raw.recordTurnTelemetry;
  const singleSwitchOn = singleSwitch !== false;

  const legacyPillMap: Record<MetricId, boolean> = {
    cpu_ram: typeof raw.showCpuRam === "boolean" ? raw.showCpuRam : true,
    branch: typeof raw.showBranch === "boolean" ? raw.showBranch : true,
    worktree: typeof raw.showWorktree === "boolean" ? raw.showWorktree : true,
    agent_id: typeof raw.showAgentId === "boolean" ? raw.showAgentId : true,
    load: typeof raw.showLoad === "boolean" ? raw.showLoad : false,
    uptime: typeof raw.showUptime === "boolean" ? raw.showUptime : false,
    mcp: typeof raw.showMcp === "boolean" ? raw.showMcp : (typeof raw.mcp === "boolean" ? raw.mcp : true),
    agent_title: typeof raw.showAgentTitle === "boolean" ? raw.showAgentTitle : false,
    agent: typeof raw.showAgent === "boolean" ? raw.showAgent : false,
    agent_provider: typeof raw.showAgentProvider === "boolean" ? raw.showAgentProvider : false,
    agent_activity: typeof raw.showAgentActivity === "boolean" ? raw.showAgentActivity : false,
    changes: false,
    tokens: false,
    tools: false,
  };

  const result: Record<MetricId, SurfaceTarget> = { ...DEFAULT_METRIC_SURFACES };

  for (const id of METRIC_IDS) {
    const pill = legacyPillMap[id];
    // If single switch was on: on = both for core metrics
    // If single switch was off: off = none for timeline
    const timeline = singleSwitchOn && isCoreTimelineMetric(id);
    result[id] = targetFromCheckboxes(pill, timeline);
  }

  return result;
}

export const TopSettingsSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object") {
      const obj = { ...(val as Record<string, unknown>) };
      if (!obj.metricSurfaces) {
        obj.metricSurfaces = migrateLegacyMetricSurfaces(obj);
      }
      return obj;
    }
    return val;
  },
  z.object({
    pillMode: PillModeSchema,
    metricSurfaces: z.record(MetricIdSchema, SurfaceTargetSchema).default(DEFAULT_METRIC_SURFACES),
    showCpuRam: z.boolean().optional(),
    showBranch: z.boolean().optional(),
    showWorktree: z.boolean().optional(),
    showAgentTitle: z.boolean().optional(),
    showAgent: z.boolean().optional(),
    showAgentProvider: z.boolean().optional(),
    showAgentActivity: z.boolean().optional(),
    showAgentId: z.boolean().optional(),
    showLoad: z.boolean().optional(),
    showUptime: z.boolean().optional(),
    showMcp: z.boolean().optional(),
    mcp: z.boolean().optional(),
    showCustomPills: z.boolean().default(true),
    customPillEnabled: z.record(z.string(), z.boolean()).default({}),
    provisionedMetrics: z.array(MetricIdSchema).default([]),
    recordTurnTelemetry: z.boolean().optional(),
    intervalSeconds: z.number().min(1).max(60).default(3),
    defaultTab: z.enum(["system", "context", "settings", "about"]).default("system"),
  })
);

export type TopSettings = z.infer<typeof TopSettingsSchema>;

export const topSettingsContract = defineSettingsContract({
  name: "top.settings",
  schema: TopSettingsSchema,
  description: "Paseo top composer pill and display settings",
});

