import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  useRpc,
  type PluginClientContext,
  type PluginComposerPillProps,
} from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/react-native";
import { getSystemResourcesRpc, type SystemResources } from "./resources.shared";

const openers = new Map<string, () => void>();

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function ProgressBar({
  value,
  color,
  bgColor,
}: {
  value: number;
  color: string;
  bgColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.progressTrack, { backgroundColor: bgColor }]}>
      <View
        style={[
          styles.progressBar,
          { width: `${clamped}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

function ResourceModalContent({
  theme,
  initialData,
}: {
  theme: PluginComposerPillProps["theme"];
  initialData: SystemResources | null;
}) {
  const fetchResources = useRpc(getSystemResourcesRpc);
  const [data, setData] = useState<SystemResources | null>(initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const update = async () => {
      try {
        const res = await fetchResources({});
        if (mounted) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load metrics");
        }
      }
    };

    update();
    const interval = setInterval(update, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchResources]);

  if (error && !data) {
    return (
      <View style={styles.modalContent}>
        <View style={styles.errorBox}>
          <Icon name="Ghost" size={24} color={theme.colors.statusDanger} />
          <Text style={[styles.errorText, { color: theme.colors.statusDanger }]}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.modalContent}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading system metrics…</Text>
      </View>
    );
  }

  const cpuColor =
    data.cpuUsagePercent > 85
      ? theme.colors.statusDanger
      : data.cpuUsagePercent > 65
      ? theme.colors.statusWarning
      : theme.colors.statusSuccess;

  const memColor =
    data.memoryUsedPercent > 85
      ? theme.colors.statusDanger
      : data.memoryUsedPercent > 70
      ? theme.colors.statusWarning
      : theme.colors.accent;

  return (
    <View style={styles.modalContent}>
      {/* Host Meta Banner */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface1,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={[styles.metaLabel, { color: theme.colors.foregroundMuted }]}>
              Host
            </Text>
            <Text
              style={[styles.metaValue, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {data.hostname}
            </Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={[styles.metaLabel, { color: theme.colors.foregroundMuted }]}>
              Uptime
            </Text>
            <Text style={[styles.metaValue, { color: theme.colors.foreground }]}>
              {formatUptime(data.uptimeSeconds)}
            </Text>
          </View>
        </View>

        <View style={[styles.metaRow, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.metaLabel, { color: theme.colors.foregroundMuted }]}>
              Processor
            </Text>
            <Text
              style={[styles.metaSubValue, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {data.cpuModel} ({data.cpuCores} cores)
            </Text>
          </View>
        </View>
      </View>

      {/* CPU Section */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface1,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            CPU Utilization
          </Text>
          <Text style={[styles.metricHighlight, { color: cpuColor }]}>
            {data.cpuUsagePercent}%
          </Text>
        </View>

        <ProgressBar
          value={data.cpuUsagePercent}
          color={cpuColor}
          bgColor={theme.colors.surface2}
        />

        <View style={styles.subStatsRow}>
          <Text style={[styles.subStatLabel, { color: theme.colors.foregroundMuted }]}>
            Load average (1m, 5m, 15m):
          </Text>
          <Text style={[styles.subStatValue, { color: theme.colors.foreground }]}>
            {data.loadAvg.map((n) => n.toFixed(2)).join("  ")}
          </Text>
        </View>
      </View>

      {/* Memory Section */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface1,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Memory
          </Text>
          <Text style={[styles.metricHighlight, { color: memColor }]}>
            {data.memoryUsedPercent}%
          </Text>
        </View>

        <ProgressBar
          value={data.memoryUsedPercent}
          color={memColor}
          bgColor={theme.colors.surface2}
        />

        <View style={styles.subStatsRow}>
          <Text style={[styles.subStatLabel, { color: theme.colors.foregroundMuted }]}>
            Used / Total:
          </Text>
          <Text style={[styles.subStatValue, { color: theme.colors.foreground }]}>
            {formatBytes(data.memoryUsedBytes)} / {formatBytes(data.memoryTotalBytes)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ResourcePill({ theme, agentId }: PluginComposerPillProps) {
  const fetchResources = useRpc(getSystemResourcesRpc);
  const [data, setData] = useState<SystemResources | null>(null);
  const [hasError, setHasError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    openers.set(agentId, () => setOpen(true));
    return () => {
      openers.delete(agentId);
    };
  }, [agentId]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetchResources({});
        if (active) {
          setData(res);
          setHasError(false);
        }
      } catch {
        if (active) {
          setHasError(true);
        }
      }
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchResources]);

  const pillContent = useMemo(() => {
    if (hasError) {
      return (
        <>
          <Icon name="Ghost" size={13} color={theme.colors.statusDanger} />
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }}
          >
            Offline
          </Text>
        </>
      );
    }

    if (!data) {
      return (
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }}
        >
          top…
        </Text>
      );
    }

    const cpuColor =
      data.cpuUsagePercent >= 85
        ? theme.colors.statusDanger
        : data.cpuUsagePercent >= 60
        ? theme.colors.statusWarning
        : theme.colors.statusSuccess;

    const memColor =
      data.memoryUsedPercent >= 85
        ? theme.colors.statusDanger
        : data.memoryUsedPercent >= 70
        ? theme.colors.statusWarning
        : theme.colors.statusSuccess;

    const ramGb = (data.memoryUsedBytes / (1024 * 1024 * 1024)).toFixed(1);

    return (
      <Text
        numberOfLines={1}
        style={{ fontSize: 11, flexShrink: 1 }}
      >
        <Text style={{ color: cpuColor, fontWeight: "600" }}>{`${data.cpuUsagePercent}%`}</Text>
        <Text style={{ color: theme.colors.foregroundMuted }}>{" · "}</Text>
        <Text style={{ color: memColor, fontWeight: "600" }}>{`${ramGb}G`}</Text>
      </Text>
    );
  }, [data, hasError, theme.colors]);

  return (
    <>
      {pillContent}
      <Modal
        title="Host System Resources"
        icon={<Icon name="Activity" size={18} color={theme.colors.foreground} />}
        open={open}
        onOpenChange={setOpen}
      >
        <Modal.Content>
          <ResourceModalContent theme={theme} initialData={data} />
        </Modal.Content>
      </Modal>
    </>
  );
}

export function contributeClient(client: PluginClientContext) {
  const pills = new Map<string, () => void>();

  function addPill(agentId: string, workspaceId: string) {
    if (pills.has(agentId)) return;
    pills.set(
      agentId,
      client.addComposerPill({
        id: "paseo-top",
        title: "System Resources",
        workspaceId,
        agentId,
        Component: ResourcePill,
        onPress() {
          const opener = openers.get(agentId);
          if (opener) opener();
        },
      }),
    );
  }

  function removePill(agentId: string) {
    pills.get(agentId)?.();
    pills.delete(agentId);
    openers.delete(agentId);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") {
      removePill(update.agentId);
      return;
    }
    const { id, workspaceId } = update.agent;
    if (workspaceId) addPill(id, workspaceId);
  });

  client.paseo.agents
    .list()
    .then((result) => {
      result.entries.forEach(({ agent }) => {
        if (agent.workspaceId) addPill(agent.id, agent.workspaceId);
      });
    })
    .catch((err) => console.error("paseo-top: seed pills failed", err));

  return () => {
    unsubscribe();
    pills.forEach((remove) => remove());
    pills.clear();
    openers.clear();
  };
}

const styles = StyleSheet.create({
  modalContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  metaSubValue: {
    fontSize: 12,
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
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  subStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  subStatLabel: {
    fontSize: 11,
  },
  subStatValue: {
    fontSize: 11,
    fontWeight: "500",
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
