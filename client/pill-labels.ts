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
  } | null;
  agentId?: string;
  worktreeLocationText?: string;
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
      const live = data?.liveUsage;
      const liveTotal =
        live && (live.inputTokens != null || live.outputTokens != null)
          ? (live.inputTokens ?? 0) + (live.outputTokens ?? 0)
          : null;
      const last = data?.lastTurn;
      const lastTotal =
        last && (last.inputTokens != null || last.outputTokens != null)
          ? (last.inputTokens ?? 0) + (last.outputTokens ?? 0)
          : null;
      const total = liveTotal ?? lastTotal;
      const prefix = def?.shortLabel ? `${def.shortLabel} ` : "";
      return total != null ? `${prefix}${total}` : `${prefix}--`;
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
