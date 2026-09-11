import { formatBytes, formatUptime } from "paseo-plugin-helper/shared";
import {
  isPillEnabled,
  legacyFlagView,
  METRIC_DEFINITIONS,
  type SystemResources,
  type TopSettings,
} from "../shared/resources";

export type PillItemType =
  | "cpu_ram"
  | "branch"
  | "worktree"
  | "agent_title"
  | "agent"
  | "agent_provider"
  | "agent_activity"
  | "agent_id"
  | "load"
  | "uptime"
  | "mcp"
  | "changes"
  | "tokens"
  | "tools"
  | "turns";

export interface SegmentSnapshot {
  data?: SystemResources;
  agent?: {
    title?: string | null;
    model?: string | null;
    provider?: string;
    status?: string;
    lastActivityAt?: string;
    lastUsage?: {
      inputTokens?: number | null;
      outputTokens?: number | null;
      cachedInputTokens?: number | null;
      contextWindowUsedTokens?: number | null;
      contextWindowMaxTokens?: number | null;
      totalCostUsd?: number | null;
      [key: string]: any;
    } | null;
    [key: string]: any;
  } | null;
  agentId?: string;
  worktreeLocationText?: string;
}

export interface TokenMetrics {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  costUsd?: number;
}

export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    return val >= 10 ? `${Math.round(val)}M` : `${parseFloat(val.toFixed(1))}M`;
  }
  if (n >= 1_000) {
    const val = n / 1_000;
    return val >= 10 ? `${Math.round(val)}k` : `${parseFloat(val.toFixed(1))}k`;
  }
  return `${Math.round(n)}`;
}

export function extractTokenMetrics(snap: {
  data?: SystemResources;
  agent?: {
    lastUsage?: any;
    [key: string]: any;
  } | null;
}): TokenMetrics | null {
  const live = snap.data?.liveUsage;
  const last = snap.data?.lastTurn;
  const agentUsage = (snap.agent as any)?.lastUsage;

  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const inputTokens =
    num(live?.inputTokens) ??
    num(last?.inputTokens) ??
    num(agentUsage?.inputTokens);

  const outputTokens =
    num(live?.outputTokens) ??
    num(last?.outputTokens) ??
    num(agentUsage?.outputTokens);

  const cachedTokens =
    num(live?.cachedInputTokens) ??
    num((last as any)?.cachedTokens) ??
    num((last as any)?.cachedInputTokens) ??
    num(agentUsage?.cachedInputTokens) ??
    num(agentUsage?.cachedTokens);

  const contextUsedTokens =
    num(live?.contextWindowUsedTokens) ??
    num(last?.contextUsedTokens) ??
    num(agentUsage?.contextWindowUsedTokens) ??
    num(agentUsage?.contextUsedTokens);

  const contextMaxTokens =
    num(live?.contextWindowMaxTokens) ??
    num(last?.contextMaxTokens) ??
    num(agentUsage?.contextWindowMaxTokens) ??
    num(agentUsage?.contextMaxTokens);

  const costUsd =
    num(live?.totalCostUsd) ??
    num(last?.costUsd) ??
    num(agentUsage?.totalCostUsd) ??
    num(agentUsage?.costUsd);

  const totalTokens =
    inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cachedTokens === undefined &&
    contextUsedTokens === undefined &&
    contextMaxTokens === undefined &&
    costUsd === undefined
  ) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    contextUsedTokens,
    contextMaxTokens,
    costUsd,
  };
}

export function formatTokensLabel(
  metrics: TokenMetrics | null,
  prefix: string | undefined = "tok",
): string {
  if (!metrics) {
    return prefix ? `${prefix} --` : "--";
  }

  // 1. Both context used and max: "58k/1M"
  if (
    metrics.contextUsedTokens != null &&
    metrics.contextMaxTokens != null &&
    metrics.contextMaxTokens > 0
  ) {
    return `${formatCompactTokens(metrics.contextUsedTokens)}/${formatCompactTokens(metrics.contextMaxTokens)}`;
  }

  // 2. Context used without max (when no total tokens or total is 0): "58k ctx"
  if (
    metrics.contextUsedTokens != null &&
    metrics.contextUsedTokens > 0 &&
    (metrics.totalTokens == null || metrics.totalTokens === 0)
  ) {
    return `${formatCompactTokens(metrics.contextUsedTokens)} ctx`;
  }

  // 3. Total tokens (input + output): "888 tok", "58k tok"
  if (metrics.totalTokens != null && metrics.totalTokens > 0) {
    return `${formatCompactTokens(metrics.totalTokens)} tok`;
  }

  // 4. Context used fallback: "58k ctx"
  if (metrics.contextUsedTokens != null && metrics.contextUsedTokens > 0) {
    return `${formatCompactTokens(metrics.contextUsedTokens)} ctx`;
  }

  return prefix ? `${prefix} --` : "--";
}

export function formatIdlePillLabel(
  status: string | undefined,
  isoString: string | null | undefined,
): string {
  if (status === "running") return "active";
  if (!isoString) return status || "--";
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return "--";
  const diffMs = Math.max(0, Date.now() - time);
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `idle ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `idle ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `idle ${hours}h`;
  const days = Math.floor(hours / 24);
  return `idle ${days}d`;
}

export function formatSegmentLabel(item: PillItemType, snap: SegmentSnapshot): string {
  const { data, agent, agentId, worktreeLocationText } = snap;
  const def = METRIC_DEFINITIONS.find((d) => d.id === item);
  switch (item) {
    case "branch":
      return data?.branch ?? "--";
    case "worktree":
      return worktreeLocationText || "--";
    case "agent_title":
      return agent?.title ?? "Agent";
    case "agent":
      return agent?.model || agent?.provider || "Agent";
    case "agent_provider":
      return agent?.provider ?? "Provider";
    case "agent_activity":
      return formatIdlePillLabel(agent?.status, agent?.lastActivityAt);
    case "agent_id":
      if (agentId && agentId.length > 7) return agentId.slice(0, 7);
      return agentId ?? "--";
    case "load": {
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      const val = data?.loadAvg?.[0] !== undefined ? data.loadAvg[0].toFixed(2) : "--";
      return `${prefix}${val}`;
    }
    case "uptime": {
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      const val = data?.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--";
      return `${prefix}${val}`;
    }
    case "mcp": {
      const mcp = data?.mcp;
      if (mcp) return `${mcp.healthy}/${mcp.total} MCP`;
      return "MCP -";
    }
    case "changes": {
      const last = data?.lastTurn;
      const hasData = last && (last.gitInsertions != null || last.gitDeletions != null);
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      return hasData ? `${prefix}+${last.gitInsertions ?? 0}/-${last.gitDeletions ?? 0}` : `${prefix}--`;
    }
    case "tokens": {
      const metrics = extractTokenMetrics(snap);
      return formatTokensLabel(metrics, def?.shortLabel);
    }
    case "tools": {
      const last = data?.lastTurn;
      const hasData = last && last.toolCalls != null;
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      return hasData
        ? `${prefix}${last.toolCalls}${last.toolErrors ? ` (${last.toolErrors} err)` : ""}`
        : `${prefix}--`;
    }
    case "turns": {
      const last = data?.lastTurn;
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      return last?.turnCount != null ? `${prefix}${last.turnCount}` : `${prefix}--`;
    }
    case "cpu_ram":
    default: {
      const ram =
        data?.memoryUsedBytes !== undefined
          ? formatBytes(data.memoryUsedBytes, { compact: true, decimals: 1 })
          : "--";
      const cpu = data?.cpuUsagePercent !== undefined ? `${data.cpuUsagePercent}%` : "--";
      return `${cpu} · ${ram}`;
    }
  }
}

export function enabledItemsForSettings(settings: TopSettings): PillItemType[] {
  const flags = legacyFlagView(settings);
  const items: PillItemType[] = [];
  const hasAnyEnabled =
    flags.showCpuRam ||
    flags.showBranch ||
    flags.showWorktree ||
    flags.showAgentTitle ||
    flags.showAgent ||
    flags.showAgentProvider ||
    flags.showAgentActivity ||
    flags.showAgentId ||
    flags.showLoad ||
    flags.showUptime ||
    flags.showMcp;
  if (flags.showCpuRam || !hasAnyEnabled) items.push("cpu_ram");
  if (flags.showBranch) items.push("branch");
  if (flags.showWorktree) items.push("worktree");
  if (flags.showAgentTitle) items.push("agent_title");
  if (flags.showAgent) items.push("agent");
  if (flags.showAgentProvider) items.push("agent_provider");
  if (flags.showAgentActivity) items.push("agent_activity");
  if (flags.showAgentId) items.push("agent_id");
  if (flags.showLoad) items.push("load");
  if (flags.showUptime) items.push("uptime");
  if (flags.showMcp) items.push("mcp");
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.changes)) {
    items.push("changes");
  }
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.tokens)) {
    items.push("tokens");
  }
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.tools)) {
    items.push("tools");
  }
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.turns)) {
    items.push("turns");
  }
  return items;
}

const cycleIndexByAgent = new Map<string, number>();

export function nextCycleItem(agentId: string, items: PillItemType[]): PillItemType | undefined {
  if (items.length === 0) return undefined;
  const current = cycleIndexByAgent.get(agentId) ?? 0;
  const item = items[current % items.length];
  cycleIndexByAgent.set(agentId, (current + 1) % items.length);
  return item;
}

export function resetCycleState(): void {
  cycleIndexByAgent.clear();
}

export function buildAllLabel(items: PillItemType[], snap: SegmentSnapshot): string {
  return items.map((item) => formatSegmentLabel(item, snap)).join(" | ");
}
