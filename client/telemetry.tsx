import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAgent, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { alpha, usePluginSettings } from "paseo-plugin-helper/client";
import { formatBytes, formatUptime, truncatePath } from "paseo-plugin-helper/shared";
import {
  isTimelineEnabled,
  isMcpSurfaceEnabled,
  topSettingsContract,
  TIMELINE_RENDERED_METRICS,
  type MetricId,
  type TopTimelineTelemetryData,
} from "../shared/resources";
import { formatCompactTokens } from "./pill-labels";

export { TIMELINE_RENDERED_METRICS };

export function TopTimelineTelemetryCard({
  item,
  theme,
  layout,
  timestamp,
}: PluginTimelineItemProps<TopTimelineTelemetryData>) {
  const data = item.data;
  const [isExpanded, setIsExpanded] = useState(false);
  const liveUsage = useAgent(data.agentId, (a: any) => a?.lastUsage);
  const inputTokens = data.inputTokens ?? (liveUsage as any)?.inputTokens;
  const outputTokens = data.outputTokens ?? (liveUsage as any)?.outputTokens;
  const cachedTokens =
    data.cachedTokens ??
    (data as any)?.cachedInputTokens ??
    (liveUsage as any)?.cachedInputTokens ??
    (liveUsage as any)?.cachedTokens;
  const contextUsedTokens =
    data.contextUsedTokens ??
    (liveUsage as any)?.contextWindowUsedTokens ??
    (liveUsage as any)?.contextUsedTokens;
  const contextMaxTokens =
    data.contextMaxTokens ??
    (liveUsage as any)?.contextWindowMaxTokens ??
    (liveUsage as any)?.contextMaxTokens;
  const costUsd =
    data.costUsd ?? (liveUsage as any)?.totalCostUsd ?? (liveUsage as any)?.costUsd;
  const { settings } = usePluginSettings(topSettingsContract);
  const surfaces = settings.metricSurfaces;
  const show = (id: MetricId) =>
    !surfaces || isTimelineEnabled(surfaces[id]);
  const showMcp = isMcpSurfaceEnabled(settings, "timeline", data.mcpInstalled, data.mcpRunning);

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
        marginBottom: 6,
      },
      headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      },
      chevronBadge: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: alpha(theme.colors.accent, 0.25),
        backgroundColor: alpha(theme.colors.accent, 0.12),
        alignItems: "center",
        justifyContent: "center",
      },
      expandedDetails: {
        marginTop: 6,
        paddingTop: 6,
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
      headerRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      },
      timeText: {
        fontSize: 10,
        color: theme.colors.foregroundMuted,
      },
      vitalsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 8,
      },
      vitalChip: {
        flexDirection: "row",
        alignItems: "center",
        flexGrow: 1,
        maxWidth: 110,
        justifyContent: "center",
        gap: 4,
      },
      vitalText: {
        fontSize: 11,
        fontWeight: "500",
      },
      tokenSection: {
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        gap: 4,
      },
      tokenHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      },
      tokenHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      },
      tokenHeaderTitle: {
        fontSize: 10,
        fontWeight: "600",
        color: theme.colors.foregroundMuted,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      },
      tokenCostText: {
        fontSize: 10,
        fontWeight: "600",
        color: theme.colors.foreground,
      },
      contextContainer: {
        marginVertical: 2,
        gap: 2,
      },
      contextLabelRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      contextLabelGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 1,
      },
      contextLabel: {
        fontSize: 10,
        color: theme.colors.foregroundMuted,
      },
      contextValue: {
        fontSize: 10,
        fontWeight: "600",
        color: theme.colors.foreground,
      },
      progressBarTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.surface2,
        overflow: "hidden",
      },
      progressBarFill: {
        height: "100%",
        borderRadius: 3,
      },
      tokenPillsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
      },
      viaTopText: {
        fontSize: 10,
        color: theme.colors.foregroundMuted,
        fontStyle: "italic",
      },
      tokenTitle: {
        fontSize: 10,
        fontWeight: "600",
        color: theme.colors.foregroundMuted,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      },
      tokenUnavailableText: {
        fontSize: 10,
        fontStyle: "italic",
        color: theme.colors.foregroundMuted,
      },
      turnDetailsRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 2,
      },
      turnDetailsItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      },
      turnDetailsText: {
        fontSize: 11,
        color: theme.colors.foreground,
      },
      tokenBadge: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.colors.surface2,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
      },
      tokenBadgeLabel: {
        fontSize: 9,
        color: theme.colors.foregroundMuted,
      },
      tokenBadgeValue: {
        fontSize: 9,
        fontWeight: "600",
        color: theme.colors.foreground,
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

  const totalTokens =
    inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;

  const contextPercent = useMemo(() => {
    if (!contextMaxTokens || contextMaxTokens <= 0) return null;
    return Math.round(((contextUsedTokens ?? 0) / contextMaxTokens) * 100);
  }, [contextUsedTokens, contextMaxTokens]);

  const contextBarColor = useMemo(() => {
    if (contextPercent == null) return theme.colors.accent ?? theme.colors.foreground;
    if (contextPercent >= 85) return theme.colors.statusDanger;
    if (contextPercent >= 70) return theme.colors.statusWarning;
    return theme.colors.statusSuccess;
  }, [contextPercent, theme.colors]);

  const hasTokenDetails =
    inputTokens != null ||
    outputTokens != null ||
    cachedTokens != null ||
    contextUsedTokens != null ||
    contextMaxTokens != null ||
    costUsd != null;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? "Collapse timeline details" : "Expand timeline details"}
        onPress={() => setIsExpanded((v) => !v)}
        style={({ pressed }) => ({
          cursor: "pointer",
          backgroundColor: pressed ? theme.colors.surface2 : "transparent",
          padding: 4,
          borderRadius: 6,
        })}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.chevronBadge}>
              <Icon
                name={isExpanded ? "ChevronDown" : "ChevronRight"}
                size={14}
                color={theme.colors.foregroundMuted}
              />
            </View>
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
          <View style={styles.headerRight}>
            {timeLabel !== "" && <Text style={styles.timeText}>{timeLabel}</Text>}
            <Text style={styles.viaTopText}>via top</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.vitalsRow}>

        {show("cpu_ram") && (
          <View style={styles.vitalChip}>
            <Icon name="Cpu" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1} style={[styles.vitalText, { color: cpuColor }]}>
              CPU {data.cpuPercent}%
            </Text>
          </View>
        )}

        {show("cpu_ram") && (
          <View style={styles.vitalChip}>
            <Icon name="Database" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1} style={[styles.vitalText, { color: memColor }]}>
              RAM {formatBytes(data.memUsedBytes)} ({data.memPercent}%)
            </Text>
          </View>
        )}

        {show("load") && (
          <View style={styles.vitalChip}>
            <Icon name="Activity" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1} style={[styles.vitalText, { color: theme.colors.foreground }]}>
              Load {data.loadAvg1m.toFixed(2)}
            </Text>
          </View>
        )}

        {showMcp && (
          <View style={styles.vitalChip}>
            <Icon name="Server" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
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
            <Text numberOfLines={1} style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {data.agentId && data.agentId.length > 7 ? data.agentId.slice(0, 7) : (data.agentId ?? "--")}
            </Text>
          </View>
        )}

        {show("agent") && (
          <View style={styles.vitalChip}>
            <Icon name="Bot" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
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
            <Text numberOfLines={1}
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

        {show("agent_title") && (
          <View style={styles.vitalChip}>
            <Icon name="Tag" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color: data.agentTitle
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.agentTitle ?? "title --"}
            </Text>
          </View>
        )}

        {show("branch") && (
          <View style={styles.vitalChip}>
            <Icon name="GitBranch" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color: data.branch
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.branch ?? "branch --"}
            </Text>
          </View>
        )}

        {show("worktree") && (
          <View style={styles.vitalChip}>
            <Icon name="Folder" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color: data.worktree
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.worktree ? truncatePath(data.worktree, 20) : "worktree --"}
            </Text>
          </View>
        )}

        {show("uptime") && (
          <View style={styles.vitalChip}>
            <Icon name="Clock" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1} style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {data.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--"}
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
            <Text numberOfLines={1} style={[styles.vitalText, { color: theme.colors.foreground }]}>
              {(data.gitFilesChanged ?? 0) > 0
                ? `±${data.gitFilesChanged} files +${data.gitInsertions ?? 0}/-${data.gitDeletions ?? 0}`
                : "No changes"}
            </Text>
          </View>
        )}

        {show("tokens") && (
          <View style={styles.vitalChip}>
            <Icon name="Coins" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color:
                    totalTokens != null || contextUsedTokens != null
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                },
              ]}
            >
              {contextUsedTokens != null && contextMaxTokens
                ? `${formatCompactTokens(contextUsedTokens)}/${formatCompactTokens(contextMaxTokens)}${contextPercent != null ? ` (${contextPercent}% ctx)` : ""}`
                : totalTokens != null
                  ? `${formatCompactTokens(totalTokens)} tok`
                  : contextUsedTokens != null
                    ? `${formatCompactTokens(contextUsedTokens)} ctx`
                    : "tok --"}
            </Text>
          </View>
        )}

        {show("tools") && (
          <View style={styles.vitalChip}>
            <Icon name="Wrench" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color:
                    data.toolCalls != null
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                },
              ]}
            >
            {data.toolCalls != null
              ? `Σ ${data.toolCalls} calls${data.toolErrors ? ` (${data.toolErrors} err)` : ""}`
              : "Σ tools --"}
            </Text>
          </View>
        )}

        {show("turns") && (
          <View style={styles.vitalChip}>
            <Icon name="Repeat" size={12} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1}
              style={[
                styles.vitalText,
                {
                  color:
                    data.turnCount != null
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                },
              ]}
            >
              {data.turnCount != null ? `${data.turnCount} turns` : "turns --"}
            </Text>
          </View>
        )}
      </View>

      {isExpanded && (
        <View style={styles.expandedDetails}>
      {show("tokens") && hasTokenDetails ? (
        <View style={styles.tokenSection}>
          <View style={styles.tokenHeader}>
            <View style={styles.tokenHeaderLeft}>
              <Icon name="Coins" size={12} color={theme.colors.foregroundMuted} />
              <Text style={styles.tokenHeaderTitle}>Tokens & Context</Text>
            </View>
            {costUsd != null && (
              <Text style={styles.tokenCostText}>
                ${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}
              </Text>
            )}
          </View>

          {contextMaxTokens != null && contextMaxTokens > 0 ? (
            <View style={styles.contextContainer}>
              <View style={styles.contextLabelRow}>
                <View style={styles.contextLabelGroup}>
                  <Text style={styles.contextLabel}>Context Window</Text>
                  <View style={styles.tokenPillsRow}>
                    {inputTokens != null && (
                      <View style={styles.tokenBadge}>
                        <Text style={styles.tokenBadgeLabel}>In: </Text>
                        <Text style={styles.tokenBadgeValue}>{inputTokens.toLocaleString()}</Text>
                      </View>
                    )}
                    {outputTokens != null && (
                      <View style={styles.tokenBadge}>
                        <Text style={styles.tokenBadgeLabel}>Out: </Text>
                        <Text style={styles.tokenBadgeValue}>{outputTokens.toLocaleString()}</Text>
                      </View>
                    )}
                    {cachedTokens != null && (
                      <View style={styles.tokenBadge}>
                        <Text style={styles.tokenBadgeLabel}>Cache: </Text>
                        <Text style={styles.tokenBadgeValue}>{cachedTokens.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.contextValue}>
                  {formatCompactTokens(contextUsedTokens ?? 0)} / {formatCompactTokens(contextMaxTokens)} ({contextPercent}%)
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, contextPercent ?? 0))}%`,
                      backgroundColor: contextBarColor,
                    },
                  ]}
                />
              </View>
            </View>
          ) : contextUsedTokens != null ? (
            <View style={styles.contextLabelRow}>
              <View style={styles.contextLabelGroup}>
                <Text style={styles.contextLabel}>Context Used</Text>
                <View style={styles.tokenPillsRow}>
                  {inputTokens != null && (
                    <View style={styles.tokenBadge}>
                      <Text style={styles.tokenBadgeLabel}>In: </Text>
                      <Text style={styles.tokenBadgeValue}>{inputTokens.toLocaleString()}</Text>
                    </View>
                  )}
                  {outputTokens != null && (
                    <View style={styles.tokenBadge}>
                      <Text style={styles.tokenBadgeLabel}>Out: </Text>
                      <Text style={styles.tokenBadgeValue}>{outputTokens.toLocaleString()}</Text>
                    </View>
                  )}
                  {cachedTokens != null && (
                    <View style={styles.tokenBadge}>
                      <Text style={styles.tokenBadgeLabel}>Cache: </Text>
                      <Text style={styles.tokenBadgeValue}>{cachedTokens.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.contextValue}>
                {formatCompactTokens(contextUsedTokens)} tokens
              </Text>
            </View>
          ) : (
            <View style={styles.tokenPillsRow}>
              {inputTokens != null && (
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeLabel}>In: </Text>
                  <Text style={styles.tokenBadgeValue}>{inputTokens.toLocaleString()}</Text>
                </View>
              )}
              {outputTokens != null && (
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeLabel}>Out: </Text>
                  <Text style={styles.tokenBadgeValue}>{outputTokens.toLocaleString()}</Text>
                </View>
              )}
              {cachedTokens != null && (
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeLabel}>Cache: </Text>
                  <Text style={styles.tokenBadgeValue}>{cachedTokens.toLocaleString()}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        show("tokens") && (
          <View style={styles.tokenSection}>
            <View style={styles.tokenHeader}>
              <Text style={styles.tokenTitle}>Tokens & Context</Text>
              <Text style={styles.tokenUnavailableText}>Not reported by provider</Text>
            </View>
          </View>
        )
      )}
      <View style={styles.tokenSection}>
        <View style={styles.tokenHeader}>
          <Text style={styles.tokenTitle}>Turn Details</Text>
        </View>
        <View style={styles.turnDetailsRow}>
          <View style={styles.turnDetailsItem}>
            <Icon name="Cpu" size={12} color={theme.colors.foregroundMuted} />
            <Text style={styles.turnDetailsText}>
              {data.agentModel ?? "Unknown model"} ({data.agentProvider ?? "default"})
            </Text>
          </View>
          {data.toolCalls != null && (
            <View style={styles.turnDetailsItem}>
              <Icon name="Wrench" size={12} color={theme.colors.foregroundMuted} />
              <Text style={styles.turnDetailsText}>
                Σ {data.toolCalls} calls{data.toolErrors ? `, ${data.toolErrors} failed` : ""}
              </Text>
            </View>
          )}
          {(data.gitInsertions != null || data.gitDeletions != null) && (
            <View style={styles.turnDetailsItem}>
              <Icon name="GitCommitHorizontal" size={12} color={theme.colors.foregroundMuted} />
              <Text style={styles.turnDetailsText}>
                +{data.gitInsertions ?? 0} -{data.gitDeletions ?? 0}
              </Text>
            </View>
          )}
        </View>
      </View>


      {data.outcomeError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText} numberOfLines={2}>
            {data.outcomeError}
          </Text>
        </View>
      )}
        </View>
      )}
    </View>
  );
}
