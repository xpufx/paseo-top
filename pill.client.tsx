import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  useWorkspace,
  useAgent,
  type PluginWorkspaceSnapshot,
  type PluginAgentSnapshot,
  type PluginClientContext,
} from "@getpaseo/plugin";
import {
  registerComposerPill,
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
} from "paseo-plugin-helper/shared";
import {
  getSystemResourcesRpc,
  topSettingsContract,
  type SystemResources,
  type ResourceField,
  type TopSettings,
  type PillMode,
} from "./resources.shared";
import { PLUGIN_VERSION } from "./version";

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
  | "load"
  | "uptime";

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
  worktreeLocationText?: string;
  isOpen?: boolean;
}

function PillItemContent({
  item,
  data,
  agent,
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

export function SingleItemPillView({
  item,
  workspaceId,
  agentId,
  isOpen,
}: {
  item: PillItemType;
  workspaceId: string;
  agentId: string;
  isOpen: boolean;
}) {
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

  if (shouldPoll && isError) {
    return (
      <View style={styles.pillContainer}>
        <Icon name="Ghost" size={13} color={colors.statusDanger} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          Offline
        </Text>
      </View>
    );
  }

  if (shouldPoll && (isLoading || !data)) {
    return (
      <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
        top…
      </Text>
    );
  }

  return (
    <PillItemContent
      item={item}
      data={data}
      agent={agent}
      worktreeLocationText={worktreeLocationText}
      isOpen={isOpen}
    />
  );
}

function PillView({ isOpen, workspaceId, agentId }: RenderPillProps) {
  const { colors } = usePluginTheme();
  const { settings } = usePluginSettings(topSettingsContract, {
    refetchInterval: 5000,
  });

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
    settings.showCpuRam ||
    settings.showBranch ||
    settings.showWorktree ||
    settings.showAgentTitle ||
    settings.showAgent ||
    settings.showAgentProvider ||
    settings.showAgentActivity ||
    settings.showLoad ||
    settings.showUptime;

  // If no items are selected, fallback to CPU & RAM without mutating saved settings
  const effectiveShowCpuRam = settings.showCpuRam || !hasAnyEnabled;

  const neededFields = useMemo(() => {
    const fields: ResourceField[] = [];
    if (effectiveShowCpuRam) {
      fields.push("cpu", "memory");
    }
    if (settings.showBranch && workspaceDirectory) {
      fields.push("branch");
    }
    if (settings.showLoad) {
      fields.push("load");
    }
    if (settings.showUptime) {
      fields.push("uptime");
    }
    return fields;
  }, [effectiveShowCpuRam, settings.showBranch, settings.showLoad, settings.showUptime, workspaceDirectory]);

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

  // Collect available items enabled by user settings (or fallback to cpu_ram)
  const items: PillItemType[] = [];
  if (effectiveShowCpuRam) items.push("cpu_ram");
  if (settings.showBranch) items.push("branch");
  if (settings.showWorktree && workspaceDirectory) items.push("worktree");
  if (settings.showAgentTitle && agent?.title) items.push("agent_title");
  if (settings.showAgent && (agent?.model || agent?.provider)) items.push("agent");
  if (settings.showAgentProvider && agent?.provider) items.push("agent_provider");
  if (settings.showAgentActivity && (agent?.lastActivityAt || agent?.status)) items.push("agent_activity");
  if (settings.showLoad) items.push("load");
  if (settings.showUptime) items.push("uptime");

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [items.length, settings.intervalSeconds]);

  if (shouldPoll && isError) {
    return (
      <View style={styles.pillContainer}>
        <Icon name="Ghost" size={13} color={colors.statusDanger} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          Offline
        </Text>
      </View>
    );
  }

  if (shouldPoll && (isLoading || !data)) {
    return (
      <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
        top…
      </Text>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.pillContainer}>
        <Icon name="Activity" size={12} color={colors.accent} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          top
        </Text>
      </View>
    );
  }

  if (settings.pillMode === "all") {
    return (
      <View style={styles.allInOneContainer}>
        {items.map((item, idx) => (
          <React.Fragment key={item}>
            {idx > 0 && <Text style={[styles.dividerText, { color: colors.foregroundMuted }]}>│</Text>}
            <PillItemContent
              item={item}
              data={data}
              agent={agent}
              worktreeLocationText={worktreeLocationText}
              isOpen={isOpen}
            />
          </React.Fragment>
        ))}
      </View>
    );
  }

  const activeMode = items.length > 0 ? items[currentIndex % items.length] : "cpu_ram";
  return (
    <PillItemContent
      item={activeMode}
      data={data}
      agent={agent}
      worktreeLocationText={worktreeLocationText}
      isOpen={isOpen}
    />
  );
}

interface ResourceModalProps extends RenderModalProps {
  initialTab?: "system" | "context" | "settings" | "about";
}

function ResourceModal({ theme, workspaceId, agentId, initialTab }: ResourceModalProps) {
  const { colors } = usePluginTheme();
  const { settings, updateSettings, resetSettings, refetch: refetchSettings } = usePluginSettings(
    topSettingsContract,
    {
      refetchInterval: 2000,
    },
  );
  const [selectedTab, setSelectedTab] = useState<string | null>(initialTab ?? null);
  const activeTab = selectedTab ?? initialTab ?? settings.defaultTab ?? "system";

  const hasAnyPillEnabled =
    settings.showCpuRam ||
    settings.showBranch ||
    settings.showWorktree ||
    settings.showAgentTitle ||
    settings.showAgent ||
    settings.showAgentProvider ||
    settings.showAgentActivity ||
    settings.showLoad ||
    settings.showUptime;

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

  const handleRefresh = () => {
    triggerHaptic("light");
    refetch();
    void refetchSettings();
  };

  const handleTabChange = (tabId: string) => {
    triggerHaptic("light");
    setSelectedTab(tabId);
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
                  ? "None selected — automatically showing CPU & RAM"
                  : (settings.pillMode ?? "cycle") === "multiple"
                    ? "Choose which items appear as dedicated pills"
                    : (settings.pillMode ?? "cycle") === "all"
                      ? "Choose which items appear together in the pill"
                      : "Choose which items cycle in the composer pill"
              }
            />
            <View style={styles.settingsToggles}>
              <Toggle
                label="CPU & RAM Usage"
                description="Live CPU load % and RAM used (e.g. 14% · 3.2G)"
                value={settings.showCpuRam}
                onValueChange={(val) => {
                  const s = { ...settings, showCpuRam: val };
                  updateSettings({ showCpuRam: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Git Branch"
                description="Active git branch name (e.g. main, feat/auth)"
                value={settings.showBranch}
                onValueChange={(val) => {
                  const s = { ...settings, showBranch: val };
                  updateSettings({ showBranch: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Worktree Location"
                description="Active workspace or worktree folder path"
                value={settings.showWorktree}
                onValueChange={(val) => {
                  const s = { ...settings, showWorktree: val };
                  updateSettings({ showWorktree: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Agent Tab Title"
                description="Active agent session title (e.g. Research architecture)"
                value={settings.showAgentTitle}
                onValueChange={(val) => {
                  const s = { ...settings, showAgentTitle: val };
                  updateSettings({ showAgentTitle: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Agent Model"
                description="Active LLM model name (e.g. claude-3-7-sonnet)"
                value={settings.showAgent}
                onValueChange={(val) => {
                  const s = { ...settings, showAgent: val };
                  updateSettings({ showAgent: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Agent Provider"
                description="LLM provider name (e.g. anthropic, openai)"
                value={settings.showAgentProvider}
                onValueChange={(val) => {
                  const s = { ...settings, showAgentProvider: val };
                  updateSettings({ showAgentProvider: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Agent Activity / Idle"
                description="Current status or inactivity duration (e.g. active, idle 4m)"
                value={settings.showAgentActivity}
                onValueChange={(val) => {
                  const s = { ...settings, showAgentActivity: val };
                  updateSettings({ showAgentActivity: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="System Load"
                description="1-minute host load average (e.g. load 0.42)"
                value={settings.showLoad}
                onValueChange={(val) => {
                  const s = { ...settings, showLoad: val };
                  updateSettings({ showLoad: val });
                  notifySettingsChanged(s);
                }}
              />
              <Toggle
                label="Host Uptime"
                description="System uptime duration (e.g. up 3d 4h)"
                value={settings.showUptime}
                onValueChange={(val) => {
                  const s = { ...settings, showUptime: val };
                  updateSettings({ showUptime: val });
                  notifySettingsChanged(s);
                }}
              />
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

export function contributeClient(client: PluginClientContext) {
  const activePills = new Map<string, () => void>();

  function syncPills(settings: TopSettings) {
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
        const cleanup = registerComposerPill(client, {
          id: "paseo-top",
          title: "top",
          modalTitle: "Host System Resources",
          modalIcon: "Activity",
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
        settings.showCpuRam ||
        settings.showBranch ||
        settings.showWorktree ||
        settings.showAgentTitle ||
        settings.showAgent ||
        settings.showAgentProvider ||
        settings.showAgentActivity ||
        settings.showLoad ||
        settings.showUptime;

      const effectiveCpu = settings.showCpuRam || !hasAny;

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
      if (settings.showBranch) {
        desiredPills.push({
          id: "paseo-top-branch",
          item: "branch",
          title: "Git Branch",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showWorktree) {
        desiredPills.push({
          id: "paseo-top-worktree",
          item: "worktree",
          title: "Worktree",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showAgentTitle) {
        desiredPills.push({
          id: "paseo-top-agent-title",
          item: "agent_title",
          title: "Agent Tab",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showAgent) {
        desiredPills.push({
          id: "paseo-top-agent",
          item: "agent",
          title: "Agent Model",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showAgentProvider) {
        desiredPills.push({
          id: "paseo-top-agent-provider",
          item: "agent_provider",
          title: "Provider",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showAgentActivity) {
        desiredPills.push({
          id: "paseo-top-agent-activity",
          item: "agent_activity",
          title: "Activity",
          modalTitle: "Host System Resources",
          defaultTab: "context",
        });
      }
      if (settings.showLoad) {
        desiredPills.push({
          id: "paseo-top-load",
          item: "load",
          title: "Load",
          modalTitle: "Host System Resources",
          defaultTab: "system",
        });
      }
      if (settings.showUptime) {
        desiredPills.push({
          id: "paseo-top-uptime",
          item: "uptime",
          title: "Uptime",
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
          const cleanup = registerComposerPill(client, {
            id: pillDef.id,
            title: pillDef.title,
            modalTitle: pillDef.modalTitle,
            modalIcon: "Activity",
            renderPill: (props) => (
              <SingleItemPillView item={pillDef.item} {...props} />
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

  // Query settings from daemon
  void client
    .rpc(topSettingsContract.get, {})
    .then((fetchedSettings) => {
      if (fetchedSettings) {
        syncPills(fetchedSettings as TopSettings);
      }
    })
    .catch(() => {
      // Ignore initial get errors
    });

  return () => {
    settingsListeners.delete(syncPills);
    for (const cleanup of activePills.values()) {
      cleanup();
    }
    activePills.clear();
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
});
