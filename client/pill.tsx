import React, { useState, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import type {
  PluginWorkspaceSnapshot,
  PluginAgentSnapshot,
} from "@getpaseo/plugin";
import {
  useWorkspace,
  useAgent,
  useRpc,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import {
  registerComposerPill,
  type ComposerPillRegistrar,
  ModalBody,
  Card,
  Button,
  KeyValue,
  KeyValueGroup,
  ProgressBar,
  MetricGauge,
  Tabs,
  Toggle,
  Badge,
  Icon,
  AboutSection,
  CustomPillBody,
  CustomPillModalContent,
  useRpcQuery,
  useAutoRefreshQuery,
  usePluginSettings,
  usePluginTheme,
  getStatusColor,
  triggerHaptic,
  type RenderModalProps,
  type RenderPillProps,
} from "paseo-plugin-helper/client";
import {
  formatBytes,
  formatUptime,
  resolveMetricStatus,
  type MetricThresholds,
  type CustomPillState,
} from "paseo-plugin-helper/shared";
import {
  getSystemResourcesRpc,
  topSettingsContract,
  getCustomPillsRpc,
  listCustomPillsRpc,
  runCustomPillModalCommandRpc,
  isPillEnabled,
  isProviderDependent,
  legacyFlagView,
  METRIC_DEFINITIONS,
  DEFAULT_METRIC_SURFACES,
  checkboxesFromTarget,
  targetFromCheckboxes,
  type SystemResources,
  type ResourceField,
  type TopSettings,
  type PillMode,
  type CustomPillDefinition,
  type CustomPillStateOutput,
  type MetricId,
  type SurfaceTarget,
} from "../shared/resources";
import { PLUGIN_VERSION } from "../shared/version";

const EMPTY_PARAMS = {};

function formatWorktreeLocation(dir: string | null | undefined): string {
  if (!dir) return "";
  // Check for Paseo-managed worktree: ~/.paseo/worktrees/<hash>/<slug>
  const wtMatch = dir.match(/[/\\]\.paseo[/\\]worktrees[/\\][^/\\]+[/\\]([^/\\]+)$/);
  if (wtMatch && wtMatch[1]) {
    return wtMatch[1];
  }
  const clean = dir.replace(/[/\\]+$/, "");
  const segments = clean.split(/[/\\]/);
  return segments[segments.length - 1] || clean;
}

function formatTimeAgo(isoString: string | null | undefined): string {
  if (!isoString) return "--";
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return "--";
  const diffMs = Math.max(0, Date.now() - time);
  const secs = Math.floor(diffMs / 1000);
  if (secs < 30) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatIdleDuration(isoString: string | null | undefined): string {
  if (!isoString) return "--";
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return "--";
  const diffMs = Math.max(0, Date.now() - time);
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatIdlePill(status: string | undefined, isoString: string | null | undefined): string {
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

const CPU_THRESHOLDS: MetricThresholds = { warning: 60, danger: 85 };
const MEM_THRESHOLDS: MetricThresholds = { warning: 70, danger: 85 };

const TABS = [
  { id: "system", label: "System", shortLabel: "System", icon: "Activity" },
  { id: "context", label: "Workspace", shortLabel: "Workspace", icon: "GitBranch" },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: "Sliders" },
  { id: "about", label: "About", shortLabel: "About", icon: "Info" },
];

function getMetricColors(
  data: SystemResources | undefined,
  colors: ReturnType<typeof usePluginTheme>["colors"],
) {
  if (
    !data ||
    data.cpuUsagePercent === undefined ||
    data.memoryUsedPercent === undefined
  ) {
    return {
      cpuColor: colors.foregroundMuted,
      memColor: colors.foregroundMuted,
    };
  }

  const cpuStatus = resolveMetricStatus(data.cpuUsagePercent, CPU_THRESHOLDS);
  const memStatus = resolveMetricStatus(data.memoryUsedPercent, MEM_THRESHOLDS);

  return {
    cpuColor: getStatusColor(cpuStatus, colors),
    memColor: getStatusColor(memStatus, colors),
  };
}

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
  | "tokens";

export type ModalTab = "system" | "context" | "settings" | "about";

export function getItemTab(item: PillItemType): "system" | "context" {
  switch (item) {
    case "cpu_ram":
    case "load":
    case "uptime":
    case "mcp":
    case "changes":
    case "tokens":
      return "system";
    case "branch":
    case "worktree":
    case "agent_title":
    case "agent":
    case "agent_provider":
    case "agent_activity":
    case "agent_id":
      return "context";
  }
}

const currentCycleTabByAgent = new Map<string, ModalTab>();

interface PillItemContentProps {
  item: PillItemType;
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
  isOpen?: boolean;
}

function PillItemContent({
  item,
  data,
  agent,
  agentId,
  worktreeLocationText,
  isOpen,
}: PillItemContentProps) {
  const { colors } = usePluginTheme();
  const { cpuColor, memColor } = getMetricColors(data, colors);

  switch (item) {
    case "branch":
      return (
        <View style={styles.pillContainer}>
          <Icon name="GitBranch" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {data?.branch ?? "--"}
          </Text>
        </View>
      );

    case "worktree":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Folder" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {worktreeLocationText || "--"}
          </Text>
        </View>
      );

    case "agent_title":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Bot" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {agent?.title ?? "Agent"}
          </Text>
        </View>
      );

    case "agent":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Cpu" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {agent?.model || agent?.provider || "Agent"}
          </Text>
        </View>
      );

    case "agent_provider":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Sparkles" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {agent?.provider ?? "Provider"}
          </Text>
        </View>
      );

    case "agent_activity": {
      const isRunning = agent?.status === "running";
      const activityText = formatIdlePill(agent?.status, agent?.lastActivityAt);
      return (
        <View style={styles.pillContainer}>
          <Icon
            name={isRunning ? "Activity" : "Clock"}
            size={12}
            color={isRunning ? colors.statusSuccess : colors.foregroundMuted}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: isRunning ? colors.statusSuccess : colors.foreground, fontWeight: "600" },
            ]}
          >
            {activityText}
          </Text>
        </View>
      );
    }

    case "agent_id":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Fingerprint" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              isOpen && styles.pillTextActive,
              { color: colors.foreground, fontWeight: "600" },
            ]}
          >
            {agentId && agentId.length > 7 ? agentId.slice(0, 7) : (agentId ?? "--")}
          </Text>
        </View>
      );

    case "load":
      return (
        <View style={styles.pillContainer}>
          <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
            <Text style={{ color: colors.foregroundMuted }}>{"load "}</Text>
            <Text style={{ color: cpuColor, fontWeight: "600" }}>
              {data?.loadAvg?.[0] !== undefined ? data.loadAvg[0].toFixed(2) : "--"}
            </Text>
          </Text>
        </View>
      );

    case "uptime":
      return (
        <View style={styles.pillContainer}>
          <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
            <Text style={{ color: colors.foregroundMuted }}>{"up "}</Text>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              {data?.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--"}
            </Text>
          </Text>
        </View>
      );

    case "mcp": {
      const mcp = data?.mcp;
      let dotChar = "○";
      let dotColor = colors.foregroundMuted;
      let text = "MCP -";

      if (mcp && !mcp.isStale) {
        dotChar = "●";
        if (mcp.down > 0) {
          dotColor = colors.statusDanger;
        } else if (mcp.degraded > 0 || mcp.healthy !== mcp.total) {
          dotColor = colors.statusWarning;
        } else {
          dotColor = colors.statusSuccess;
        }
        text = `${mcp.healthy}/${mcp.total} MCP`;
      } else if (mcp && mcp.isStale) {
        dotChar = "○";
        dotColor = colors.foregroundMuted;
        text = `${mcp.healthy}/${mcp.total} MCP`;
      }

      return (
        <View
          style={styles.pillContainer}
          accessibilityLabel="MCP Server Health (via paseo-mcp-tools)"
        >
          <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
            <Text style={{ color: dotColor, fontWeight: "700" }}>{dotChar} </Text>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{text}</Text>
          </Text>
        </View>
      );
    }

    case "changes": {
      const last = data?.lastTurn;
      const hasData = last && (last.gitInsertions != null || last.gitDeletions != null);
      return (
        <View style={styles.pillContainer}>
          <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
            <Text style={{ color: colors.foregroundMuted }}>{"Δ "}</Text>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              {hasData
                ? `+${last.gitInsertions ?? 0}/-${last.gitDeletions ?? 0}`
                : "--"}
            </Text>
          </Text>
        </View>
      );
    }

    case "tokens": {
      const last = data?.lastTurn;
      const total =
        last && (last.inputTokens != null || last.outputTokens != null)
          ? (last.inputTokens ?? 0) + (last.outputTokens ?? 0)
          : null;
      return (
        <View style={styles.pillContainer}>
          <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
            <Text style={{ color: colors.foregroundMuted }}>{"tok "}</Text>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              {total ?? "--"}
            </Text>
          </Text>
        </View>
      );
    }

    case "cpu_ram":
    default: {
      const ramGb =
        data?.memoryUsedBytes !== undefined
          ? formatBytes(data.memoryUsedBytes, { compact: true, decimals: 1 })
          : "--";
      const cpuText =
        data?.cpuUsagePercent !== undefined ? `${data.cpuUsagePercent}%` : "--";
      return (
        <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
          <Text style={{ color: cpuColor, fontWeight: "600" }}>{cpuText}</Text>
          <Text style={{ color: colors.foregroundMuted }}>{" · "}</Text>
          <Text style={{ color: memColor, fontWeight: "600" }}>{ramGb}</Text>
        </Text>
      );
    }
  }
}

type SettingsListener = (settings: TopSettings) => void;
const settingsListeners = new Set<SettingsListener>();

export function notifySettingsChanged(settings: TopSettings) {
  for (const listener of settingsListeners) {
    try {
      listener(settings);
    } catch {
      // Ignore listener errors
    }
  }
}

export interface SingleItemPillViewProps extends RenderPillProps<ModalTab> {
  item: PillItemType;
  defaultTab?: ModalTab;
}

export function SingleItemPillView({
  item,
  defaultTab,
  workspaceId,
  agentId,
  isOpen,
  open,
}: SingleItemPillViewProps) {
  const { colors } = usePluginTheme();
  const workspaceDirectory = useWorkspace(workspaceId, (w: PluginWorkspaceSnapshot) => w?.directory);
  const agent = useAgent(agentId, (a: PluginAgentSnapshot) => ({
    title: a?.title,
    model: a?.model,
    provider: a?.provider,
    status: a?.status,
    lastActivityAt: a?.lastActivityAt,
  }));

  const neededFields = useMemo(() => {
    switch (item) {
      case "cpu_ram":
        return ["cpu", "memory"] as ResourceField[];
      case "branch":
        return workspaceDirectory ? (["branch"] as ResourceField[]) : [];
    case "load":
        return ["load"] as ResourceField[];
      case "uptime":
        return ["uptime"] as ResourceField[];
      case "mcp":
        return ["mcp"] as ResourceField[];
      default:
        return [] as ResourceField[];
    }
  }, [item, workspaceDirectory]);

  const shouldPoll = neededFields.length > 0;

  const queryParams = useMemo(() => {
    return {
      ...(workspaceDirectory ? { directory: workspaceDirectory } : {}),
      ...(shouldPoll ? { fields: neededFields } : {}),
    };
  }, [workspaceDirectory, shouldPoll, neededFields]);

  const { data, isError, isLoading } = useRpcQuery(
    getSystemResourcesRpc,
    queryParams,
    {
      enabled: shouldPoll,
      refetchInterval: shouldPoll ? 3000 : false,
    },
  );

  const worktreeLocationText = useMemo(
    () => formatWorktreeLocation(workspaceDirectory),
    [workspaceDirectory],
  );

  const targetTab = defaultTab ?? getItemTab(item);

  if (item === "mcp") {
    if (isLoading || !data || !data.mcpInstalled) {
      return null;
    }
  }

  if (shouldPoll && isError) {
    return (
      <Pressable
        onPress={() => open(targetTab)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={styles.pillContainer}
      >
        <Icon name="Ghost" size={13} color={colors.statusDanger} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          Offline
        </Text>
      </Pressable>
    );
  }

  if (shouldPoll && (isLoading || !data)) {
    return (
      <Pressable
        onPress={() => open(targetTab)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          top...
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => open(targetTab)}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={styles.cyclePressable}
    >
      <PillItemContent
        item={item}
        data={data}
        agent={agent}
        agentId={agentId}
        worktreeLocationText={worktreeLocationText}
        isOpen={isOpen}
      />
    </Pressable>
  );
}

function PillView({ isOpen, open, workspaceId, agentId }: RenderPillProps<ModalTab>) {
  const { colors } = usePluginTheme();
  const { settings, updateSettings } = usePluginSettings(topSettingsContract, {
    refetchInterval: 5000,
  });
  const flags = legacyFlagView(settings);

  useEffect(() => {
    notifySettingsChanged(settings);
  }, [settings]);

  const workspaceDirectory = useWorkspace(workspaceId, (w: PluginWorkspaceSnapshot) => w?.directory);
  const agent = useAgent(agentId, (a: PluginAgentSnapshot) => ({
    title: a?.title,
    model: a?.model,
    provider: a?.provider,
    status: a?.status,
    lastActivityAt: a?.lastActivityAt,
  }));

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
    (flags.showMcp);

  // If no items are selected, fallback to CPU & RAM without mutating saved settings
  const effectiveShowCpuRam = flags.showCpuRam || !hasAnyEnabled;

  const neededFields = useMemo(() => {
    const fields: ResourceField[] = [];
    if (effectiveShowCpuRam) {
      fields.push("cpu", "memory");
    }
    if (flags.showBranch && workspaceDirectory) {
      fields.push("branch");
    }
    if (flags.showLoad) {
      fields.push("load");
    }
    if (flags.showUptime) {
      fields.push("uptime");
    }
    if (flags.showMcp) {
      fields.push("mcp");
    }
    return fields;
  }, [
    effectiveShowCpuRam,
    flags.showBranch,
    flags.showLoad,
    flags.showUptime,
    flags.showMcp,
    settings.mcp,
    workspaceDirectory,
  ]);

  const shouldPoll = neededFields.length > 0;

  const queryParams = useMemo(() => {
    return {
      ...(workspaceDirectory ? { directory: workspaceDirectory } : {}),
      ...(shouldPoll ? { fields: neededFields } : {}),
    };
  }, [workspaceDirectory, shouldPoll, neededFields]);

  const { data, isError, isLoading } = useRpcQuery(
    getSystemResourcesRpc,
    queryParams,
    {
      enabled: shouldPoll,
      refetchInterval: shouldPoll ? 3000 : false,
    },
  );

  const isMcpEnabled = (flags.showMcp) && Boolean(data?.mcpInstalled);

  useEffect(() => {
    const found: MetricId[] = [];
    const last = data?.lastTurn;
    if (last && (last.inputTokens != null || last.outputTokens != null)) {
      found.push("tokens");
    }
    if (agent?.model || agent?.provider) {
      found.push("agent", "agent_provider");
    }
    if (found.length > 0) {
      const have = new Set(settings.provisionedMetrics ?? []);
      if (found.some((id) => !have.has(id))) {
        updateSettings({
          provisionedMetrics: [...have, ...found.filter((id) => !have.has(id))],
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.lastTurn, agent?.model, agent?.provider]);

  const worktreeLocationText = useMemo(
    () => formatWorktreeLocation(workspaceDirectory),
    [workspaceDirectory],
  );

  // Collect available items enabled by user settings (or fallback to cpu_ram)
  const items: PillItemType[] = [];
  if (effectiveShowCpuRam) items.push("cpu_ram");
  if (flags.showBranch) items.push("branch");
  if (flags.showWorktree && workspaceDirectory) items.push("worktree");
  if (flags.showAgentTitle && agent?.title) items.push("agent_title");
  if (flags.showAgent && (agent?.model || agent?.provider)) items.push("agent");
  if (flags.showAgentProvider && agent?.provider) items.push("agent_provider");
  if (flags.showAgentActivity && (agent?.lastActivityAt || agent?.status)) items.push("agent_activity");
  if (flags.showAgentId && agentId) items.push("agent_id");
  if (flags.showLoad) items.push("load");
  if (flags.showUptime) items.push("uptime");
  if (isMcpEnabled) items.push("mcp");
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.changes)) {
    items.push("changes");
  }
  if (settings.metricSurfaces && isPillEnabled(settings.metricSurfaces.tokens)) {
    items.push("tokens");
  }

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [items.length, settings.intervalSeconds]);

  const activeMode = items.length > 0 ? items[currentIndex % items.length] : "cpu_ram";
  const activeTab = getItemTab(activeMode);

  useEffect(() => {
    currentCycleTabByAgent.set(agentId, activeTab);
    return () => {
      currentCycleTabByAgent.delete(agentId);
    };
  }, [agentId, activeTab]);

  if (shouldPoll && isError) {
    return (
      <Pressable
        onPress={() => open(settings.defaultTab ?? "system")}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={styles.pillContainer}
      >
        <Icon name="Ghost" size={13} color={colors.statusDanger} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          Offline
        </Text>
      </Pressable>
    );
  }

  if (shouldPoll && (isLoading || !data)) {
    return (
      <Pressable
        onPress={() => open(settings.defaultTab ?? "system")}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          top...
        </Text>
      </Pressable>
    );
  }

  if (items.length === 0) {
    return (
      <Pressable
        onPress={() => open(settings.defaultTab ?? "system")}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={styles.pillContainer}
      >
        <Icon name="Activity" size={12} color={colors.accent} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          top
        </Text>
      </Pressable>
    );
  }

  if (settings.pillMode === "all") {
    return (
      <View style={styles.allInOneContainer}>
        {items.map((item, idx) => {
          const segmentTab = getItemTab(item);
          return (
            <React.Fragment key={item}>
              {idx > 0 && <Text style={[styles.dividerText, { color: colors.foregroundMuted }]}>│</Text>}
              <Pressable
                onPress={() => open(segmentTab)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                style={styles.segmentPressable}
              >
      <PillItemContent
        item={item}
        data={data}
        agent={agent}
        agentId={agentId}
        worktreeLocationText={worktreeLocationText}
        isOpen={isOpen}
      />
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => open(activeTab)}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={styles.cyclePressable}
    >
      <PillItemContent
        item={activeMode}
        data={data}
        agent={agent}
        worktreeLocationText={worktreeLocationText}
        isOpen={isOpen}
      />
    </Pressable>
  );
}

interface ResourceModalProps extends RenderModalProps<ModalTab> {
  initialTab?: ModalTab;
}

function MetricSurfaceMatrix({
  settings,
  updateSettings,
  notifySettingsChanged,
  mcpInstalled,
}: {
  settings: TopSettings;
  updateSettings: (updates: Partial<TopSettings>) => void;
  notifySettingsChanged: (s: TopSettings) => void;
  mcpInstalled: boolean;
}) {
  const { colors } = usePluginTheme();
  const surfaces = settings.metricSurfaces ?? DEFAULT_METRIC_SURFACES;
  const provisioned = new Set(settings.provisionedMetrics ?? []);
  const setTarget = (id: MetricId, target: SurfaceTarget) => {
    const next = { ...surfaces, [id]: target };
    const s = { ...settings, metricSurfaces: next };
    updateSettings({ metricSurfaces: next });
    notifySettingsChanged(s);
  };
  return (
    <View style={{ gap: 12 }}>
      {METRIC_DEFINITIONS.map((def, index) => {
        const boxes = checkboxesFromTarget(surfaces[def.id]);
        const unavailable =
          isProviderDependent(def.id) && !provisioned.has(def.id);
        const timelineDisabled = !!def.pillOnly;
        const disabled = (def.id === "mcp" && !mcpInstalled) || unavailable;
        const setBox = (which: "pill" | "timeline", val: boolean) => {
          const nextBoxes = { ...boxes, [which]: val };
          if (def.pillOnly) nextBoxes.timeline = false;
          setTarget(
            def.id,
            targetFromCheckboxes(nextBoxes.pill, nextBoxes.timeline),
          );
        };
        return (
          <View
            key={def.id}
            style={[
              unavailable ? { opacity: 0.55 } : undefined,
              index < METRIC_DEFINITIONS.length - 1
                ? {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    paddingBottom: 10,
                  }
                : undefined,
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.foreground,
                marginBottom: 2,
              }}
            >
              {def.title}
            </Text>
            <Text
              style={{ fontSize: 11, color: colors.foregroundMuted, marginBottom: 8 }}
            >
              {unavailable
                ? "Not available for this provider yet"
                : def.pillOnly
                  ? "Live value only; snapshots would freeze it"
                  : def.id === "mcp" && !mcpInstalled
                    ? "Requires paseo-mcp-tools plugin (not installed)"
                    : def.description}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, paddingLeft: 4 }}>
              <Toggle
                label="Pill"
                labelStyle={{ fontSize: 11 }}
                value={boxes.pill}
                disabled={disabled}
                onValueChange={(val) => setBox("pill", val)}
              />
              <Toggle
                label="Timeline"
                labelStyle={{ fontSize: 11 }}
                value={boxes.timeline && !def.pillOnly}
                disabled={disabled || timelineDisabled}
                onValueChange={(val) => setBox("timeline", val)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ResourceModal({ theme, workspaceId, agentId, initialTab, payload }: ResourceModalProps) {
  const { colors } = usePluginTheme();
  const { settings, updateSettings, resetSettings, refetch: refetchSettings } = usePluginSettings(
    topSettingsContract,
    {
      refetchInterval: 2000,
    },
  );
  const { data: customPillList } = useRpcQuery(listCustomPillsRpc, EMPTY_PARAMS, {
    refetchInterval: 5000,
  });
  const flags = legacyFlagView(settings);
  const [selectedTab, setSelectedTab] = useState<ModalTab | null>(null);
  const activeTab = selectedTab ?? payload ?? initialTab ?? settings.defaultTab ?? "system";

  useEffect(() => {
    if (payload) {
      setSelectedTab(payload);
    }
  }, [payload]);

  // Ensure freshest settings are fetched whenever user views settings
  useEffect(() => {
    if (activeTab === "settings") {
      void refetchSettings();
    }
  }, [activeTab, refetchSettings]);

  const workspace = useWorkspace(workspaceId, (w: PluginWorkspaceSnapshot) => ({
    name: w?.name,
    title: w?.title,
    projectDisplayName: w?.projectDisplayName,
    directory: w?.directory,
    kind: w?.kind,
    status: w?.status,
    statusEnteredAt: w?.statusEnteredAt,
    diffStat: w?.diffStat,
  }));

  const agent = useAgent(agentId, (a: PluginAgentSnapshot) => ({
    title: a?.title,
    model: a?.model,
    provider: a?.provider,
    status: a?.status,
    cwd: a?.cwd,
    lastActivityAt: a?.lastActivityAt,
  }));

  const queryParams = useMemo(() => {
    return workspace?.directory ? { directory: workspace.directory } : EMPTY_PARAMS;
  }, [workspace?.directory]);

  const { data, isError, error, isLoading, isRefetching, refetch } = useAutoRefreshQuery(
    getSystemResourcesRpc,
    queryParams,
    {
      defaultRate: "2s",
      isOpen: true,
    },
  );

  const isMcpEnabled = (flags.showMcp) && Boolean(data?.mcpInstalled);

  const hasAnyPillEnabled =
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
    isMcpEnabled;

  const handleRefresh = () => {
    triggerHaptic("light");
    refetch();
    void refetchSettings();
  };

  const handleTabChange = (tabId: string) => {
    triggerHaptic("light");
    setSelectedTab(tabId as ModalTab);
  };

  if (isError && !data) {
    return (
      <ModalBody refreshing={isRefetching} onRefresh={handleRefresh}>
        <Card variant="elevated">
          <View style={styles.errorBox}>
            <Icon name="Ghost" size={24} color={colors.statusDanger} />
            <Text style={[styles.errorText, { color: colors.statusDanger }]}>
              {error instanceof Error ? error.message : "Failed to load metrics"}
            </Text>
          </View>
        </Card>
      </ModalBody>
    );
  }

  if (isLoading || !data) {
    return (
      <ModalBody refreshing={isRefetching} onRefresh={handleRefresh}>
        <Text style={{ color: colors.foregroundMuted }}>Loading system metrics…</Text>
      </ModalBody>
    );
  }

  const { cpuColor, memColor } = getMetricColors(data, colors);

  return (
    <ModalBody refreshing={isRefetching} onRefresh={handleRefresh}>
      {/* Navigation Tabs */}
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        style={styles.tabs}
      />

      {activeTab === "system" && (
        <>
          {/* Dual Metric Gauges Hero */}
          <Card variant="elevated">
            <View style={styles.gaugeContainer}>
              <MetricGauge
                value={data.cpuUsagePercent ?? 0}
                thresholds={CPU_THRESHOLDS}
                label="CPU Load"
                size={82}
              />
              <MetricGauge
                value={data.memoryUsedPercent ?? 0}
                thresholds={MEM_THRESHOLDS}
                label="RAM Used"
                size={82}
              />
            </View>
          </Card>

          {/* Host Meta Card */}
          <Card variant="elevated">
            <KeyValueGroup columns={2}>
              <KeyValue label="Host" value={data.hostname ?? "Unknown"} copyable />
              <KeyValue
                label="Uptime"
                value={data.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--"}
              />
            </KeyValueGroup>
            <KeyValue
              label="Processor"
              value={data.cpuModel ?? "--"}
              subValue={data.cpuCores ? `(${data.cpuCores} cores)` : undefined}
            />
          </Card>

          {/* CPU Utilization Card */}
          <Card variant="elevated">
            <Card.Header
              title="CPU Details"
              value={
                <Text style={[styles.metricHighlight, { color: cpuColor }]}>
                  {data.cpuUsagePercent ?? 0}%
                </Text>
              }
            />

            <ProgressBar
              value={data.cpuUsagePercent ?? 0}
              thresholds={CPU_THRESHOLDS}
              height={8}
            />

            <KeyValue
              label="Load Average (1m, 5m, 15m)"
              value={data.loadAvg ? data.loadAvg.map((n) => n.toFixed(2)).join("  ") : "--"}
              mono
            />
          </Card>

          {/* Memory Card */}
          <Card variant="elevated">
            <Card.Header
              title="Memory Details"
              value={
                <Text style={[styles.metricHighlight, { color: memColor }]}>
                  {data.memoryUsedPercent ?? 0}%
                </Text>
              }
            />

            <ProgressBar
              value={data.memoryUsedPercent ?? 0}
              thresholds={MEM_THRESHOLDS}
              height={8}
            />

            <KeyValue
              label="Used / Total"
              value={`${formatBytes(data.memoryUsedBytes ?? 0)} / ${formatBytes(data.memoryTotalBytes ?? 0)}`}
            />
          </Card>

          {/* MCP Servers Card */}
          {Boolean(data.mcpInstalled) && (
            <Card variant="elevated">
              <Card.Header
                title="MCP Servers"
                subtitle="Source: paseo-mcp-tools"
                icon="Server"
                value={
                  data.mcp ? (
                    <Badge
                      label={data.mcp.isStale ? "Stale Snapshot" : "Live"}
                      variant={data.mcp.isStale ? "warning" : "success"}
                      dot
                    />
                  ) : (
                    <Badge label="No Data" variant="neutral" />
                  )
                }
              />

              {data.mcp ? (
                <>
                  <KeyValueGroup columns={2}>
                    <KeyValue
                      label="Health"
                      value={`${data.mcp.healthy} healthy / ${data.mcp.total} total`}
                    />
                    <KeyValue
                      label="Snapshot Updated"
                      value={formatTimeAgo(data.mcp.updatedAt)}
                    />
                    <KeyValue
                      label="Data Provider"
                      value="paseo-mcp-tools"
                    />
                  </KeyValueGroup>

                  {data.mcp.servers && data.mcp.servers.length > 0 ? (
                    <View style={styles.mcpList}>
                      {data.mcp.servers.map((srv) => {
                        const badgeVariant: "success" | "warning" | "danger" | "neutral" =
                          srv.status === "healthy"
                            ? "success"
                            : srv.status === "degraded"
                              ? "warning"
                              : srv.status === "down"
                                ? "danger"
                                : "neutral";
                        return (
                          <View key={srv.name} style={styles.mcpRow}>
                            <View style={styles.mcpInfo}>
                              <Text
                                numberOfLines={1}
                                style={[styles.mcpName, { color: colors.foreground }]}
                              >
                                {srv.name}
                              </Text>
                              <Text style={[styles.mcpLatency, { color: colors.foregroundMuted }]}>
                                {srv.latencyMs >= 0 ? `${srv.latencyMs}ms` : "timeout"}
                              </Text>
                            </View>
                            <Badge label={srv.status} variant={badgeVariant} />
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.mcpEmpty, { color: colors.foregroundMuted }]}>
                      No MCP servers configured
                    </Text>
                  )}
                </>
              ) : (
                <Text style={[styles.mcpEmpty, { color: colors.foregroundMuted }]}>
                  Waiting for status snapshot from paseo-mcp-tools...
                </Text>
              )}
            </Card>
          )}

          {/* Custom Metric Pills Card */}
          {Boolean(data.customPills && data.customPills.length > 0) && (
            <Card variant="elevated">
              <Card.Header
                title="Custom Metric Pills"
                subtitle="Discovered from ~/.paseo/top/pills"
                icon="Sliders"
                value={
                  <Badge
                    label={`${data.customPills?.length ?? 0} active`}
                    variant="accent"
                  />
                }
              />
              <KeyValueGroup columns={data.customPills!.length > 1 ? 2 : 1}>
                {data.customPills!.map((cp) => (
                  <KeyValue
                    key={cp.id}
                    label={cp.title}
                    value={cp.displayValue}
                    subValue={cp.status !== "neutral" ? `(${cp.status})` : undefined}
                  />
                ))}
              </KeyValueGroup>
            </Card>
          )}
        </>
      )}

      {activeTab === "context" && (
        <>
          {/* Workspace Information */}
          <Card variant="elevated">
            <Card.Header
              title="Workspace & Git"
              icon="GitBranch"
              value={
                workspace?.status ? (
                  <Badge label={workspace.status} variant="info" />
                ) : undefined
              }
            />
            <KeyValueGroup columns={2}>
              <KeyValue label="Git Branch" value={data?.branch || "Unknown"} />
              <KeyValue label="Kind" value={workspace?.kind || "Unknown"} />
            </KeyValueGroup>
            {workspace?.directory ? (
              <KeyValue label="Worktree Location" value={workspace.directory} copyable mono />
            ) : null}
            {workspace?.name ? (
              <KeyValue label="Workspace Name" value={workspace.name} />
            ) : null}
            {workspace?.title && workspace.title !== workspace.name ? (
              <KeyValue label="Workspace Title" value={workspace.title} />
            ) : null}
            {workspace?.projectDisplayName ? (
              <KeyValue label="Project" value={workspace.projectDisplayName} />
            ) : null}
            {workspace?.diffStat ? (
              <KeyValue
                label="Git Changes"
                value={`+${workspace.diffStat.additions}  -${workspace.diffStat.deletions}`}
              />
            ) : null}
          </Card>

          {/* Agent Information */}
          <Card variant="elevated">
            <Card.Header
              title={agent?.title ? `Agent: ${agent.title}` : "Agent Session"}
              icon="Bot"
              value={
                agent?.status ? (
                  <Badge
                    label={agent.status}
                    variant={agent.status === "running" ? "success" : "info"}
                  />
                ) : undefined
              }
            />
            {agent?.title ? (
              <KeyValue label="Agent Tab" value={agent.title} />
            ) : null}
            {agentId ? (
              <KeyValue label="Agent ID" value={agentId} copyable mono />
            ) : null}
            <KeyValueGroup columns={2}>
              <KeyValue label="Model" value={agent?.model || "Standard"} />
              <KeyValue label="Provider" value={agent?.provider || "Default"} />
            </KeyValueGroup>
            <KeyValueGroup columns={2}>
              <KeyValue
                label="Last Worked"
                value={
                  agent?.status === "running"
                    ? "Active now"
                    : formatTimeAgo(agent?.lastActivityAt)
                }
              />
              <KeyValue
                label="Inactivity"
                value={
                  agent?.status === "running"
                    ? "0s (active)"
                    : formatIdleDuration(agent?.lastActivityAt)
                }
              />
            </KeyValueGroup>
            {agent?.cwd ? (
              <KeyValue label="Working Directory" value={agent.cwd} copyable mono />
            ) : null}
          </Card>
        </>
      )}

      {activeTab === "settings" && (
        <>
          {/* Pill Display Mode */}
          <Card variant="elevated">
            <Card.Header
              title="Pill Display Mode"
              icon="LayoutGrid"
              subtitle="How active items appear in the composer trackbar"
            />
            <View style={styles.modeRow}>
              {[
                { id: "cycle", label: "Cycle", desc: "Rotate one at a time" },
                { id: "all", label: "All in One", desc: "Combined into one pill" },
                { id: "multiple", label: "Multiple", desc: "Dedicated pills" },
              ].map((modeOption) => {
                const isSelected = (settings.pillMode ?? "cycle") === modeOption.id;
                return (
                  <View
                    key={modeOption.id}
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: isSelected ? colors.surface1 : colors.surface0,
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      onPress={() => {
                        triggerHaptic("light");
                        const newSettings: TopSettings = {
                          ...settings,
                          pillMode: modeOption.id as PillMode,
                        };
                        updateSettings({ pillMode: modeOption.id as PillMode });
                        notifySettingsChanged(newSettings);
                      }}
                      style={[
                        styles.modeTitle,
                        {
                          color: isSelected ? colors.accent : colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {modeOption.label}
                    </Text>
                    <Text style={[styles.modeDesc, { color: colors.foregroundMuted }]}>
                      {modeOption.desc}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* Active Pill Items Selectors */}
          <Card variant="elevated">
            <Card.Header
              title="Active Pill Items"
              icon="Sliders"
              subtitle={
                !hasAnyPillEnabled
                  ? "None selected -- automatically showing CPU & RAM"
                  : (settings.pillMode ?? "cycle") === "multiple"
                    ? "Choose which items appear as dedicated pills"
                    : (settings.pillMode ?? "cycle") === "all"
                      ? "Choose which items appear together in the pill"
                      : "Choose which items cycle in the composer pill"
              }
            />
            <View style={styles.settingsToggles}>
              <MetricSurfaceMatrix
                settings={settings}
                updateSettings={updateSettings}
                notifySettingsChanged={notifySettingsChanged}
                mcpInstalled={Boolean(data?.mcpInstalled)}
              />
            </View>
          </Card>

          {/* Custom Metric Pills */}
          <Card variant="elevated">
            <Card.Header
              title="Custom Metric Pills"
              icon="Sliders"
              subtitle="Standalone pills discovered from ~/.paseo/top/pills"
            />
            <View style={styles.settingsToggles}>
              <Toggle
                label="Show Custom Metric Pills"
                description="Display pills defined in ~/.paseo/top/pills as standalone composer pills"
                value={settings.showCustomPills ?? true}
                onValueChange={(val) => {
                  const s = { ...settings, showCustomPills: val };
                  updateSettings({ showCustomPills: val });
                  notifySettingsChanged(s);
                }}
              />
              {(customPillList?.pills ?? []).map((pill) => {
                const enabled = settings.customPillEnabled?.[pill.id] ?? pill.enabled;
                return (
                  <Toggle
                    key={pill.id}
                    label={pill.title}
                    description={pill.sourceFile ?? "Config file in ~/.paseo/top/pills"}
                    value={enabled}
                    onValueChange={(val) => {
                      const s = {
                        ...settings,
                        customPillEnabled: { ...settings.customPillEnabled, [pill.id]: val },
                      };
                      updateSettings({ customPillEnabled: s.customPillEnabled });
                      notifySettingsChanged(s);
                    }}
                  />
                );
              })}
            </View>
          </Card>

          {/* Rotation Speed Setting (Cycle mode only) */}
          {(settings.pillMode ?? "cycle") === "cycle" && (
            <Card variant="elevated">
              <Card.Header
                title="Rotation Speed"
                icon="Clock"
                value={
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    {`${settings.intervalSeconds}s`}
                  </Text>
                }
              />
              <View style={styles.speedRow}>
                {[2, 3, 4, 6].map((sec) => (
                  <View
                    key={sec}
                    style={[
                      styles.speedChip,
                      {
                        backgroundColor:
                          settings.intervalSeconds === sec ? colors.accent : colors.surface1,
                        borderColor:
                          settings.intervalSeconds === sec ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      onPress={() => {
                        triggerHaptic("light");
                        updateSettings({ intervalSeconds: sec });
                      }}
                      style={[
                        styles.speedChipText,
                        {
                          color:
                            settings.intervalSeconds === sec
                              ? colors.accentForeground
                              : colors.foreground,
                          fontWeight: settings.intervalSeconds === sec ? "700" : "500",
                        },
                      ]}
                    >
                      {`${sec}s`}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Default Modal Tab Setting */}
          <Card variant="elevated">
            <Card.Header
              title="Default Modal Tab"
              icon="Sliders"
              value={
                <Text style={{ color: colors.accent, fontWeight: "600" }}>
                  {TABS.find((t) => t.id === settings.defaultTab)?.label || "System"}
                </Text>
              }
            />
            <View style={styles.speedRow}>
              {TABS.map((tab) => {
                const isSelected = (settings.defaultTab || "system") === tab.id;
                return (
                  <View
                    key={tab.id}
                    style={[
                      styles.speedChip,
                      {
                        flex: 1,
                        backgroundColor: isSelected ? colors.accent : colors.surface1,
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      onPress={() => {
                        triggerHaptic("light");
                        updateSettings({
                          defaultTab: tab.id as "system" | "context" | "settings" | "about",
                        });
                      }}
                      style={[
                        styles.speedChipText,
                        {
                          color: isSelected ? colors.accentForeground : colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          <Button
            label="Reset to Defaults"
            variant="secondary"
            onPress={() => {
              triggerHaptic("medium");
              resetSettings();
              notifySettingsChanged(topSettingsContract.defaultSettings);
              setSelectedTab(null);
            }}
          />
        </>
      )}

      {activeTab === "about" && (
        <AboutSection
          name="paseo-top"
          description="Live host system and workspace monitor for Paseo composer trackbar."
          version={data?.version ?? PLUGIN_VERSION}
          author="xpufx"
          repository="https://github.com/xpufx/paseo-top"
          issues="https://github.com/xpufx/paseo-top/issues"
          license="MIT"
          extraItems={[
            {
              label: "Host Platform",
              value: data?.platform ? `${data.platform} (${data.arch ?? "unknown"})` : "Linux",
              copyable: true,
            },
            { label: "Host Name", value: data?.hostname ?? "localhost", copyable: true },
            { label: "CPU Model", value: data?.cpuModel ?? "unknown", copyable: true },
            {
              label: "CPU Cores",
              value: `${data?.cpuCores ?? 0} cores`,
            },
            {
              label: "Total Memory",
              value: data?.memoryTotalBytes ? formatBytes(data.memoryTotalBytes) : "unknown",
            },
            {
              label: "Host Uptime",
              value: data?.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "unknown",
            },
            { label: "Active Workspace", value: workspace?.name ?? "none", copyable: true },
            { label: "Workspace Directory", value: workspace?.directory ?? "unknown", copyable: true },
            { label: "Active Git Branch", value: data?.branch ?? "unknown", copyable: true },
            { label: "Agent Model", value: agent?.model ?? "none", copyable: true },
          ]}
        />
      )}

      {/* Discrete Version Footer */}
      {activeTab !== "about" && (
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.foregroundMuted }]}>
            top v{data?.version ?? PLUGIN_VERSION}
          </Text>
        </View>
      )}
    </ModalBody>
  );
}

interface LiveCustomPillViewProps {
  pillId: string;
  initial: CustomPillState;
}

function LiveCustomPillView({ pillId, initial }: LiveCustomPillViewProps) {
  const { data } = useRpcQuery(getCustomPillsRpc, EMPTY_PARAMS, { refetchInterval: 3000 });
  const liveState = data?.pills.find((p) => p.id === pillId) ?? initial;
  return <CustomPillBody state={liveState} />;
}

interface LiveCustomPillModalProps {
  pillId: string;
  initial: CustomPillStateOutput;
}

function LiveCustomPillModal({ pillId, initial }: LiveCustomPillModalProps) {
  const { colors } = usePluginTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [outputOverride, setOutputOverride] = useState<string | undefined>(undefined);
  const { data, refetch } = useRpcQuery(getCustomPillsRpc, EMPTY_PARAMS, { refetchInterval: 3000 });
  const liveState = data?.pills.find((p) => p.id === pillId) ?? initial;
  const runModalCommand = useRpc(runCustomPillModalCommandRpc);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await runModalCommand({ pillId });
      if (res?.output) {
        setOutputOverride(res.output);
      }
      void refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // Run the drilldown command once when the modal opens so it never shows stale pill output
  const didInitialRun = useRef(false);
  useEffect(() => {
    if (didInitialRun.current) return;
    didInitialRun.current = true;
    void handleRefresh();
  }, [pillId]);

  const effectiveState: CustomPillStateOutput = {
    ...liveState,
    modalOutput: outputOverride ?? liveState.modalOutput,
  };

  return (
    <View>
      <CustomPillModalContent
        state={effectiveState}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />
      <View style={styles.customPillHint}>
        <Text style={[styles.footerText, { color: colors.foregroundMuted }]}>
          Custom metric pill from paseo-top
          {effectiveState.sourceFile ? ` - defined in ${effectiveState.sourceFile}` : ""}
        </Text>
      </View>
    </View>
  );
}

export function contributeClient(client: ComposerPillRegistrar | PluginClientContext) {
  const activePills = new Map<string, () => void>();
  let latestSettings: TopSettings = topSettingsContract.defaultSettings;

  function syncPills(settings: TopSettings) {
    latestSettings = settings;
    const flags = legacyFlagView(settings);
    const mode = settings.pillMode ?? "cycle";

    if (mode === "cycle" || mode === "all") {
      // Remove all single-item pills
      for (const [key, cleanup] of activePills.entries()) {
        if (key !== "paseo-top") {
          cleanup();
          activePills.delete(key);
        }
      }

      // Ensure main pill is registered
      if (!activePills.has("paseo-top")) {
        const cleanup = registerComposerPill<ModalTab>(client, {
          id: "paseo-top",
          title: "top",
          modalTitle: "Host System Resources",
          modalIcon: "Activity",
          resolveDefaultPayload: ({ agentId }) => {
            if (latestSettings.pillMode === "all") {
              return latestSettings.defaultTab;
            }
            return currentCycleTabByAgent.get(agentId) ?? latestSettings.defaultTab;
          },
          renderPill: (props) => <PillView {...props} />,
          renderModal: (props) => <ResourceModal {...props} />,
        });
        activePills.set("paseo-top", cleanup);
      }
    } else if (mode === "multiple") {
      // Remove main pill
      if (activePills.has("paseo-top")) {
        activePills.get("paseo-top")!();
        activePills.delete("paseo-top");
      }

      const hasAny =
        flags.showCpuRam ||
        flags.showBranch ||
        flags.showWorktree ||
        flags.showAgentTitle ||
        flags.showAgent ||
        flags.showAgentProvider ||
        flags.showAgentActivity ||
        flags.showAgentId ||
        flags.showLoad ||
        flags.showUptime;

      const effectiveCpu = flags.showCpuRam || !hasAny;

      const desiredPills: {
        id: string;
        item: PillItemType;
        title: string;
        modalTitle: string;
        defaultTab: "system" | "context";
      }[] = [];

      if (effectiveCpu) {
        desiredPills.push({
          id: "paseo-top-cpu",
          item: "cpu_ram",
          title: "CPU & RAM",
          modalTitle: "Host System Resources",
          defaultTab: "system",
        });
      }
      if (flags.showBranch) {
        desiredPills.push({
          id: "paseo-top-branch",
          item: "branch",
          title: "Git Branch",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showWorktree) {
        desiredPills.push({
          id: "paseo-top-worktree",
          item: "worktree",
          title: "Worktree",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showAgentTitle) {
        desiredPills.push({
          id: "paseo-top-agent-title",
          item: "agent_title",
          title: "Agent Tab",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showAgent) {
        desiredPills.push({
          id: "paseo-top-agent",
          item: "agent",
          title: "Agent Model",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showAgentProvider) {
        desiredPills.push({
          id: "paseo-top-agent-provider",
          item: "agent_provider",
          title: "Provider",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showAgentActivity) {
        desiredPills.push({
          id: "paseo-top-agent-activity",
          item: "agent_activity",
          title: "Activity",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showAgentId ?? true) {
        desiredPills.push({
          id: "paseo-top-agent-id",
          item: "agent_id",
          title: "Agent ID",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (flags.showLoad) {
        desiredPills.push({
          id: "paseo-top-load",
          item: "load",
          title: "Load",
          modalTitle: "Host System Resources",
          defaultTab: "system",
        });
      }
      if (flags.showUptime) {
        desiredPills.push({
          id: "paseo-top-uptime",
          item: "uptime",
          title: "Uptime",
          modalTitle: "Host System Resources",
          defaultTab: "system",
        });
      }
      if (flags.showMcp) {
        desiredPills.push({
          id: "paseo-top-mcp",
          item: "mcp",
          title: "MCP Health",
          modalTitle: "Host System Resources",
          defaultTab: "system",
        });
      }

      const desiredIds = new Set(desiredPills.map((p) => p.id));

      // Remove pills no longer desired
      for (const [key, cleanup] of activePills.entries()) {
        if (!desiredIds.has(key)) {
          cleanup();
          activePills.delete(key);
        }
      }

      // Register newly desired pills
      for (const pillDef of desiredPills) {
        if (!activePills.has(pillDef.id)) {
          const cleanup = registerComposerPill<ModalTab>(client, {
            id: pillDef.id,
            title: pillDef.title,
            modalTitle: pillDef.modalTitle,
            modalIcon: "Activity",
            resolveDefaultPayload: () => pillDef.defaultTab,
            renderPill: (props) => (
              <SingleItemPillView
                item={pillDef.item}
                defaultTab={pillDef.defaultTab}
                {...props}
              />
            ),
            renderModal: (props) => (
              <ResourceModal initialTab={pillDef.defaultTab} {...props} />
            ),
          });
          activePills.set(pillDef.id, cleanup);
        }
      }
    }
  }

  // Register settings listener
  settingsListeners.add(syncPills);

  // Initial sync synchronously
  syncPills(topSettingsContract.defaultSettings);

  // Query settings from daemon if client supports rpc
  const clientWithRpc = client as {
    rpc?: (contract: any, input: any) => Promise<any>;
  };
  if (typeof clientWithRpc.rpc === "function") {
    void clientWithRpc
      .rpc(topSettingsContract.get, {})
      .then((fetchedSettings: any) => {
        if (fetchedSettings) {
          syncPills(fetchedSettings as TopSettings);
        }
      })
      .catch(() => {
        // Ignore initial get errors
      });
  }

  // Dynamic discovery and lifecycle management for user custom metric pills
  const activeCustomPills = new Map<string, () => void>();

  async function syncCustomPills() {
    const showCustom = latestSettings.showCustomPills ?? true;
    if (!showCustom) {
      // Master toggle off: unregister all custom pills
      for (const [id, cleanup] of activeCustomPills.entries()) {
        cleanup();
        activeCustomPills.delete(id);
      }
      return;
    }

    try {
      if (typeof clientWithRpc.rpc !== "function") return;
      const res = await clientWithRpc.rpc(getCustomPillsRpc, EMPTY_PARAMS);
      const pills: CustomPillStateOutput[] = res?.pills ?? [];
      const pillIds = new Set(pills.map((p: CustomPillStateOutput) => p.id));

      // Remove pills that are no longer configured
      for (const [id, cleanup] of activeCustomPills.entries()) {
        if (!pillIds.has(id)) {
          cleanup();
          activeCustomPills.delete(id);
        }
      }

      // Register newly discovered custom metric pills
      for (const pill of pills) {
        if (!activeCustomPills.has(pill.id)) {
          const cleanup = registerComposerPill(client, {
            id: `top-custom-${pill.id}`,
            title: pill.title,
            compactTitle: pill.compactTitle,
            icon: pill.icon,
            compactIcon: pill.compactIcon,
            modalTitle: pill.modalTitle ?? pill.title,
            renderPill: () => <LiveCustomPillView pillId={pill.id} initial={pill} />,
            renderModal: () => (
              <LiveCustomPillModal pillId={pill.id} initial={pill} />
            ),
          });
          activeCustomPills.set(pill.id, cleanup);
        }
      }
    } catch {
      // Ignore initial get errors
    }
  }

  void syncCustomPills();
  const customPillInterval = setInterval(syncCustomPills, 5000);
  const onSettingsChanged = () => {
    void syncCustomPills();
  };
  settingsListeners.add(onSettingsChanged);

  return () => {
    clearInterval(customPillInterval);
    settingsListeners.delete(syncPills);
    settingsListeners.delete(onSettingsChanged);
    for (const cleanup of activePills.values()) {
      cleanup();
    }
    activePills.clear();
    for (const cleanup of activeCustomPills.values()) {
      cleanup();
    }
    activeCustomPills.clear();
  };
}

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
    flexShrink: 1,
    minWidth: 0,
  },
  pillText: {
    fontSize: 11,
    flexShrink: 1,
  },
  pillTextActive: {
    opacity: 0.85,
  },
  metricHighlight: {
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  customPillHint: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 12,
  },
  footerText: {
    fontSize: 10,
    opacity: 0.65,
    fontFamily: "monospace",
  },
  errorBox: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tabs: {
    marginBottom: 4,
  },
  gaugeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
  },
  settingsToggles: {
    gap: 8,
  },
  speedRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  speedChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  speedChipText: {
    fontSize: 13,
  },
  allInOneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    flexShrink: 1,
    minWidth: 0,
  },
  segmentPressable: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  cyclePressable: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  dividerText: {
    fontSize: 10,
    opacity: 0.6,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  modeCard: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  modeTitle: {
    fontSize: 13,
  },
  modeDesc: {
    fontSize: 11,
    lineHeight: 14,
  },
  mcpList: {
    gap: 8,
    marginTop: 4,
  },
  mcpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  mcpInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  mcpName: {
    fontSize: 13,
    fontWeight: "500",
  },
  mcpLatency: {
    fontSize: 11,
    fontFamily: "monospace",
  },
  mcpEmpty: {
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 4,
  },
});
