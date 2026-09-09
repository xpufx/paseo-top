import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { usePluginSettings } from "paseo-plugin-helper/client";
import { formatBytes } from "paseo-plugin-helper/shared";
import {
  isTimelineEnabled,
  topSettingsContract,
  TIMELINE_RENDERED_METRICS,
  type MetricId,
  type TopTimelineTelemetryData,
} from "../shared/resources";

export { TIMELINE_RENDERED_METRICS };

export function TopTimelineTelemetryCard({
  item,
  theme,
  layout,
  timestamp,
}: PluginTimelineItemProps<TopTimelineTelemetryData>) {
  const data = item.data;
  const { settings } = usePluginSettings(topSettingsContract);
  const surfaces = settings.metricSurfaces;
  const show = (id: MetricId) =>
    !surfaces || isTimelineEnabled(surfaces[id]);

  const styles = useMemo(() => {
    const isFailed = data.outcomeKind === "failed";
    return StyleSheet.create({
      card: {
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: isFailed ? theme.colors.statusDanger : theme.colors.border,
        padding: layout.compact ? 6 : 8,
        marginVertical: 2,
      },
      header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
      },
      headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      },
      title: {
        fontSize: 12,
        fontWeight: "600",
        color: theme.colors.foreground,
      },
      durationBadge: {
        backgroundColor: theme.colors.surface2,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
      },
      durationText: {
        fontSize: 10,
        fontWeight: "500",
        color: theme.colors.foregroundMuted,
      },
      timeText: {
        fontSize: 10,
        color: theme.colors.foregroundMuted,
      },
      footerRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 2,
      },
      footerText: {
        fontSize: 9,
        color: theme.colors.foregroundMuted,
        opacity: 0.7,
      },
      vitalsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      },
      vitalChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      },
      vitalText: {
        fontSize: 11,
        fontWeight: "500",
      },
      errorContainer: {
        marginTop: 8,
        padding: 6,
        borderRadius: 4,
        backgroundColor: theme.colors.surface2,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.statusDanger,
      },
      errorText: {
        fontSize: 11,
        color: theme.colors.statusDanger,
      },
    });
  }, [data.outcomeKind, theme, layout.compact]);

  const outcomeConfig = useMemo(() => {
    switch (data.outcomeKind) {
      case "completed":
        return {
          icon: "CheckCircle2",
          color: theme.colors.statusSuccess,
          label: "Turn Completed",
        };
      case "failed":
        return {
          icon: "AlertCircle",
          color: theme.colors.statusDanger,
          label: "Turn Failed",
        };
      case "canceled":
        return {
          icon: "MinusCircle",
          color: theme.colors.statusWarning,
          label: "Turn Canceled",
        };
      default:
        return {
          icon: "Activity",
          color: theme.colors.foregroundMuted,
          label: "Turn Ended",
        };
    }
  }, [data.outcomeKind, theme.colors]);

  const cpuColor = useMemo(() => {
    if (data.cpuPercent >= 85) return theme.colors.statusDanger;
    if (data.cpuPercent >= 70) return theme.colors.statusWarning;
    return theme.colors.foreground;
  }, [data.cpuPercent, theme.colors]);

  const memColor = useMemo(() => {
    if (data.memPercent >= 90) return theme.colors.statusDanger;
    if (data.memPercent >= 75) return theme.colors.statusWarning;
    return theme.colors.foreground;
  }, [data.memPercent, theme.colors]);

  const timeLabel = useMemo(() => {
    try {
      const d = data.timestamp ? new Date(data.timestamp) : timestamp;
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }, [data.timestamp, timestamp]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name={outcomeConfig.icon} size={14} color={outcomeConfig.color} />
          <Text style={styles.title}>{outcomeConfig.label}</Text>
          {data.durationMs != null && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {(data.durationMs / 1000).toFixed(1)}s
              </Text>
            </View>
          )}
        </View>
        {timeLabel !== "" && <Text style={styles.timeText}>{timeLabel}</Text>}
      </View>

      <View style={styles.vitalsRow}>
        {show("cpu_ram") && (
          <View style={styles.vitalChip}>
            <Icon name="Cpu" size={12} color={theme.colors.foregroundMuted} />
            <Text style={[styles.vitalText, { color: cpuColor }]}>
              CPU {data.cpuPercent}%
            </Text>
          </View>
        )}

        {show("cpu_ram") && (
          <View style={styles.vitalChip}>
            <Icon name="Database" size={12} color={theme.colors.foregroundMuted} />
            <Text style={[styles.vitalText, { color: memColor }]}>
              RAM {formatBytes(data.memUsedBytes)} ({data.memPercent}%)
            </Text>
          </View>
        )}

        {show("load") && (
          <View style={styles.vitalChip}>
            <Icon name="Activity" size={12} color={theme.colors.foregroundMuted} />
            <Text style={[styles.vitalText, { color: theme.colors.foreground }]}>
              Load {data.loadAvg1m.toFixed(2)}
            </Text>
          </View>
        )}

        {show("mcp") && (
          <View style={styles.vitalChip}>
            <Icon name="Server" size={12} color={theme.colors.foregroundMuted} />
            <Text
              style={[
                styles.vitalText,
                {
                  color:
                    data.mcpTotal == null
                      ? theme.colors.foregroundMuted
                      : (data.mcpHealthy ?? 0) === data.mcpTotal
                        ? theme.colors.statusSuccess
                        : theme.colors.statusWarning,
                },
              ]}
            >
              {data.mcpTotal != null
                ? `MCP ${data.mcpHealthy ?? 0}/${data.mcpTotal}`
                : "MCP --"}
            </Text>
          </View>
        )}

        {show("agent_id") && (
          <View style={styles.vitalChip}>
            <Icon name="Fingerprint" size={12} color={theme.colors.foregroundMuted} />
            <Text style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {data.agentId && data.agentId.length > 7 ? data.agentId.slice(0, 7) : (data.agentId ?? "--")}
            </Text>
          </View>
        )}

        {show("agent") && (
          <View style={styles.vitalChip}>
            <Icon name="Bot" size={12} color={theme.colors.foregroundMuted} />
            <Text
              style={[
                styles.vitalText,
                {
                  color: data.agentModel
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.agentModel ?? "model --"}
            </Text>
          </View>
        )}

        {show("agent_provider") && (
          <View style={styles.vitalChip}>
            <Icon name="Globe" size={12} color={theme.colors.foregroundMuted} />
            <Text
              style={[
                styles.vitalText,
                {
                  color: data.agentProvider
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.agentProvider ?? "provider --"}
            </Text>
          </View>
        )}

        {show("changes") && (
          <View style={styles.vitalChip}>
            <Icon
              name="GitCommitHorizontal"
              size={12}
              color={theme.colors.foregroundMuted}
            />
            <Text style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {(data.gitFilesChanged ?? 0) > 0
                ? `±${data.gitFilesChanged} files +${data.gitInsertions ?? 0}/-${data.gitDeletions ?? 0}`
                : "No changes"}
            </Text>
          </View>
        )}

        {show("tokens") && (
          <View style={styles.vitalChip}>
            <Icon name="Coins" size={12} color={theme.colors.foregroundMuted} />
            <Text
              style={[
                styles.vitalText,
                {
                  color:
                    data.inputTokens != null || data.outputTokens != null
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.inputTokens != null || data.outputTokens != null
                ? `${(data.inputTokens ?? 0) + (data.outputTokens ?? 0)} tok${
                    data.contextMaxTokens
                      ? ` (${Math.round(
                          ((data.contextUsedTokens ?? 0) / data.contextMaxTokens) * 100,
                        )}% ctx)`
                      : ""
                  }`
                : "tok --"}
            </Text>
          </View>
        )}

        {data.toolCalls != null && data.toolCalls > 0 && (
          <View style={styles.vitalChip}>
            <Icon name="Wrench" size={12} color={theme.colors.foregroundMuted} />
            <Text style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {data.toolCalls} tools
              {data.toolErrors ? ` (${data.toolErrors} err)` : ""}
            </Text>
          </View>
        )}
      </View>

      {data.outcomeError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText} numberOfLines={2}>
            {data.outcomeError}
          </Text>
        </View>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>via top</Text>
      </View>
    </View>
  );
}
