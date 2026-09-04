import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PluginClientContext, PluginComposerPillProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import {
  registerComposerPill,
  ModalBody,
  Card,
  KeyValue,
  ProgressBar,
  useRpcQuery,
  usePluginTheme,
  type RenderModalProps,
} from "paseo-plugin-helper/client";
import { formatBytes, formatUptime } from "paseo-plugin-helper/shared";
import { getSystemResourcesRpc, type SystemResources } from "./resources.shared";

const EMPTY_PARAMS = {};

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

  const cpuColor =
    data.cpuUsagePercent >= 85
      ? colors.statusDanger
      : data.cpuUsagePercent >= 60
      ? colors.statusWarning
      : colors.statusSuccess;

  const memColor =
    data.memoryUsedPercent >= 85
      ? colors.statusDanger
      : data.memoryUsedPercent >= 70
      ? colors.statusWarning
      : colors.statusSuccess;

  return { cpuColor, memColor };
}

function PillView({ theme }: PluginComposerPillProps) {
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
  const ramGb = (data.memoryUsedBytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <Text numberOfLines={1} style={styles.pillText}>
      <Text style={{ color: cpuColor, fontWeight: "600" }}>{`${data.cpuUsagePercent}%`}</Text>
      <Text style={{ color: colors.foregroundMuted }}>{" · "}</Text>
      <Text style={{ color: memColor, fontWeight: "600" }}>{`${ramGb}G`}</Text>
    </Text>
  );
}

function ResourceModal({ theme }: RenderModalProps) {
  const { colors } = usePluginTheme();
  const { data, isError, error, isLoading } = useRpcQuery(
    getSystemResourcesRpc,
    EMPTY_PARAMS,
    {
      refetchInterval: 1500,
    },
  );

  if (isError && !data) {
    return (
      <ModalBody>
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
      <ModalBody>
        <Text style={{ color: colors.foregroundMuted }}>Loading system metrics…</Text>
      </ModalBody>
    );
  }

  const { cpuColor, memColor } = getMetricColors(data, colors);

  return (
    <ModalBody>
      {/* Host Meta Card */}
      <Card variant="elevated">
        <KeyValue label="Host" value={data.hostname} copyable />
        <KeyValue label="Uptime" value={formatUptime(data.uptimeSeconds)} />
        <KeyValue
          label="Processor"
          value={data.cpuModel}
          subValue={`(${data.cpuCores} cores)`}
        />
      </Card>

      {/* CPU Utilization Card */}
      <Card variant="elevated">
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            CPU Utilization
          </Text>
          <Text style={[styles.metricHighlight, { color: cpuColor }]}>
            {data.cpuUsagePercent}%
          </Text>
        </View>

        <ProgressBar
          value={data.cpuUsagePercent}
          color={cpuColor}
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
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Memory
          </Text>
          <Text style={[styles.metricHighlight, { color: memColor }]}>
            {data.memoryUsedPercent}%
          </Text>
        </View>

        <ProgressBar
          value={data.memoryUsedPercent}
          color={memColor}
          height={8}
        />

        <KeyValue
          label="Used / Total"
          value={`${formatBytes(data.memoryUsedBytes)} / ${formatBytes(data.memoryTotalBytes)}`}
        />
      </Card>
    </ModalBody>
  );
}

export function contributeClient(client: PluginClientContext) {
  return registerComposerPill(client, {
    id: "paseo-top",
    title: "Host System Resources",
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  metricHighlight: {
    fontSize: 15,
    fontWeight: "700",
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
});
