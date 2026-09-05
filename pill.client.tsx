import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PluginClientContext } from "@getpaseo/plugin";
import {
  registerComposerPill,
  ModalBody,
  Card,
  KeyValue,
  KeyValueGroup,
  ProgressBar,
  MetricGauge,
  Tabs,
  Icon,
  useRpcQuery,
  useAutoRefreshQuery,
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
import { getSystemResourcesRpc, type SystemResources } from "./resources.shared";
import { PLUGIN_VERSION } from "./version";

const EMPTY_PARAMS = {};

const CPU_THRESHOLDS: MetricThresholds = { warning: 60, danger: 85 };
const MEM_THRESHOLDS: MetricThresholds = { warning: 70, danger: 85 };

const TABS = [
  { id: "system", label: "System Resources", shortLabel: "System", icon: "Activity" },
  { id: "context", label: "Workspace Context", shortLabel: "Context", icon: "GitBranch" },
];

function getMetricColors(
  data: SystemResources | undefined,
  colors: ReturnType<typeof usePluginTheme>["colors"],
) {
  if (!data) {
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

function PillView({ isOpen }: RenderPillProps) {
  const { colors } = usePluginTheme();
  const { data, isError, isLoading } = useRpcQuery(
    getSystemResourcesRpc,
    EMPTY_PARAMS,
    {
      refetchInterval: 3000,
    },
  );

  if (isError) {
    return (
      <View style={styles.pillContainer}>
        <Icon name="Ghost" size={13} color={colors.statusDanger} />
        <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
          Offline
        </Text>
      </View>
    );
  }

  if (isLoading || !data) {
    return (
      <Text numberOfLines={1} style={[styles.pillText, { color: colors.foregroundMuted }]}>
        top…
      </Text>
    );
  }

  const { cpuColor, memColor } = getMetricColors(data, colors);
  const ramGb = formatBytes(data.memoryUsedBytes, { compact: true, decimals: 1 });

  return (
    <Text numberOfLines={1} style={[styles.pillText, isOpen && styles.pillTextActive]}>
      <Text style={{ color: cpuColor, fontWeight: "600" }}>{`${data.cpuUsagePercent}%`}</Text>
      <Text style={{ color: colors.foregroundMuted }}>{" · "}</Text>
      <Text style={{ color: memColor, fontWeight: "600" }}>{ramGb}</Text>
    </Text>
  );
}

function ResourceModal({ theme }: RenderModalProps) {
  const { colors } = usePluginTheme();
  const [activeTab, setActiveTab] = useState("system");

  const { data, isError, error, isLoading, isRefetching, refetch } = useAutoRefreshQuery(
    getSystemResourcesRpc,
    EMPTY_PARAMS,
    {
      defaultRate: "2s",
      isOpen: true,
    },
  );

  const handleRefresh = () => {
    triggerHaptic("light");
    refetch();
  };

  const handleTabChange = (tabId: string) => {
    triggerHaptic("light");
    setActiveTab(tabId);
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

      {activeTab === "system" ? (
        <>
          {/* Dual Metric Gauges Hero */}
          <Card variant="elevated">
            <View style={styles.gaugeContainer}>
              <MetricGauge
                value={data.cpuUsagePercent}
                thresholds={CPU_THRESHOLDS}
                label="CPU Load"
                size={82}
              />
              <MetricGauge
                value={data.memoryUsedPercent}
                thresholds={MEM_THRESHOLDS}
                label="RAM Used"
                size={82}
              />
            </View>
          </Card>

          {/* Host Meta Card */}
          <Card variant="elevated">
            <KeyValueGroup columns={2}>
              <KeyValue label="Host" value={data.hostname} copyable />
              <KeyValue label="Uptime" value={formatUptime(data.uptimeSeconds)} />
            </KeyValueGroup>
            <KeyValue
              label="Processor"
              value={data.cpuModel}
              subValue={`(${data.cpuCores} cores)`}
            />
          </Card>

          {/* CPU Utilization Card */}
          <Card variant="elevated">
            <Card.Header
              title="CPU Details"
              value={
                <Text style={[styles.metricHighlight, { color: cpuColor }]}>
                  {data.cpuUsagePercent}%
                </Text>
              }
            />

            <ProgressBar
              value={data.cpuUsagePercent}
              thresholds={CPU_THRESHOLDS}
              height={8}
            />

            <KeyValue
              label="Load Average (1m, 5m, 15m)"
              value={data.loadAvg.map((n) => n.toFixed(2)).join("  ")}
              mono
            />
          </Card>

          {/* Memory Card */}
          <Card variant="elevated">
            <Card.Header
              title="Memory Details"
              value={
                <Text style={[styles.metricHighlight, { color: memColor }]}>
                  {data.memoryUsedPercent}%
                </Text>
              }
            />

            <ProgressBar
              value={data.memoryUsedPercent}
              thresholds={MEM_THRESHOLDS}
              height={8}
            />

            <KeyValue
              label="Used / Total"
              value={`${formatBytes(data.memoryUsedBytes)} / ${formatBytes(data.memoryTotalBytes)}`}
            />
          </Card>
        </>
      ) : (
        /* Workspace Context Tab (Ready for branch, worktree, agent info) */
        <Card variant="elevated">
          <Card.Header
            title="Workspace Context"
            icon="GitBranch"
            subtitle="Active branch, worktree & agent session"
          />
          <View style={styles.emptyContext}>
            <Text style={[styles.contextPlaceholder, { color: colors.foregroundMuted }]}>
              Workspace and agent context features coming next.
            </Text>
          </View>
        </Card>
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
  emptyContext: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  contextPlaceholder: {
    fontSize: 13,
    textAlign: "center",
  },
});
