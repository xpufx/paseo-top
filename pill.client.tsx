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

const CPU_THRESHOLDS: MetricThresholds = { warning: 60, danger: 85 };
const MEM_THRESHOLDS: MetricThresholds = { warning: 70, danger: 85 };

const TABS = [
  { id: "system", label: "System", shortLabel: "System", icon: "Activity" },
  { id: "context", label: "Workspace", shortLabel: "Workspace", icon: "GitBranch" },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: "Sliders" },
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

function PillView({ isOpen, workspaceId, agentId }: RenderPillProps) {
  const { colors } = usePluginTheme();
  const { settings } = usePluginSettings(topSettingsContract, {
    refetchInterval: 5000,
  });

  const workspaceDirectory = useWorkspace(workspaceId, (w: PluginWorkspaceSnapshot) => w?.directory);
  const agentInfo = useAgent(agentId, (a: PluginAgentSnapshot) => a?.title || a?.model || a?.provider);

  const neededFields = useMemo(() => {
    const fields: ResourceField[] = [];
    if (settings.showCpuRam) {
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
  }, [settings.showCpuRam, settings.showBranch, settings.showLoad, settings.showUptime, workspaceDirectory]);

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

  // Collect available items enabled by user settings
  const items: ("cpu_ram" | "branch" | "worktree" | "agent" | "load" | "uptime")[] = [];
  if (settings.showCpuRam && data?.cpuUsagePercent !== undefined) items.push("cpu_ram");
  if (settings.showBranch && data?.branch) items.push("branch");
  if (settings.showWorktree && workspaceDirectory) items.push("worktree");
  if (settings.showAgent && agentInfo) items.push("agent");
  if (settings.showLoad && data?.loadAvg?.[0] !== undefined) items.push("load");
  if (settings.showUptime && data?.uptimeSeconds) items.push("uptime");

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
      <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
        top…
      </Text>
    );
  }

  const { cpuColor, memColor } = getMetricColors(data, colors);
  const activeMode = items.length > 0 ? items[currentIndex % items.length] : "cpu_ram";

  switch (activeMode) {
    case "branch":
      return (
        <View style={styles.pillContainer}>
          <Icon name="GitBranch" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[styles.pillText, isOpen && styles.pillTextActive, { color: colors.foreground, fontWeight: "600" }]}
          >
            {data?.branch ?? "Unknown"}
          </Text>
        </View>
      );

    case "worktree":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Folder" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[styles.pillText, isOpen && styles.pillTextActive, { color: colors.foreground, fontWeight: "600" }]}
          >
            {worktreeLocationText}
          </Text>
        </View>
      );

    case "agent":
      return (
        <View style={styles.pillContainer}>
          <Icon name="Bot" size={12} color={colors.accent} />
          <Text
            numberOfLines={1}
            style={[styles.pillText, isOpen && styles.pillTextActive, { color: colors.foreground, fontWeight: "600" }]}
          >
            {agentInfo}
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

function ResourceModal({ theme, workspaceId, agentId }: RenderModalProps) {
  const { colors } = usePluginTheme();
  const { settings, updateSettings, resetSettings, refetch: refetchSettings } = usePluginSettings(
    topSettingsContract,
    {
      refetchInterval: 2000,
    },
  );
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const activeTab = selectedTab ?? (settings.defaultTab || "system");

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
          {/* Alternating Pill Selectors */}
          <Card variant="elevated">
            <Card.Header
              title="Alternating Pill Info"
              icon="Sliders"
              subtitle="Choose which items cycle in the composer trackbar"
            />
            <View style={styles.settingsToggles}>
              <Toggle
                label="CPU & RAM Usage"
                description="Live CPU load % and RAM used (e.g. 14% · 3.2G)"
                value={settings.showCpuRam}
                onValueChange={(val) => updateSettings({ showCpuRam: val })}
              />
              <Toggle
                label="Git Branch"
                description="Active git branch name (e.g. main, feat/auth)"
                value={settings.showBranch}
                onValueChange={(val) => updateSettings({ showBranch: val })}
              />
              <Toggle
                label="Worktree Location"
                description="Active workspace or worktree folder path"
                value={settings.showWorktree}
                onValueChange={(val) => updateSettings({ showWorktree: val })}
              />
              <Toggle
                label="Agent / Model"
                description="Active agent tab title or model name"
                value={settings.showAgent}
                onValueChange={(val) => updateSettings({ showAgent: val })}
              />
              <Toggle
                label="System Load"
                description="1-minute host load average (e.g. load 0.42)"
                value={settings.showLoad}
                onValueChange={(val) => updateSettings({ showLoad: val })}
              />
              <Toggle
                label="Host Uptime"
                description="System uptime duration (e.g. up 3d 4h)"
                value={settings.showUptime}
                onValueChange={(val) => updateSettings({ showUptime: val })}
              />
            </View>
          </Card>

          {/* Rotation Speed Setting */}
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
                          defaultTab: tab.id as "system" | "context" | "settings",
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
              setSelectedTab(null);
            }}
          />
        </>
      )}

      {/* Discrete Version Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.foregroundMuted }]}>
          top v{data?.version ?? PLUGIN_VERSION}
        </Text>
      </View>
    </ModalBody>
  );
}

export function contributeClient(client: PluginClientContext) {
  return registerComposerPill(client, {
    id: "paseo-top",
    title: "top",
    modalTitle: "Host System Resources",
    modalIcon: "Activity",
    renderPill: (props) => <PillView {...props} />,
    renderModal: (props) => <ResourceModal {...props} />,
  });
}

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
});
