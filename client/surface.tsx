import React from "react";
import { Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Card,
  KeyValue,
  KeyValueGroup,
  useRpcQuery,
  usePluginTheme,
} from "paseo-plugin-helper/client";
import { formatBytes, formatUptime } from "paseo-plugin-helper/shared";
import { getSystemResourcesRpc } from "../shared/resources";

const EMPTY_PARAMS = {};

export function TopDashboardSurface(_props: PluginSurfaceProps) {
  const { colors } = usePluginTheme();
  const { data, isLoading } = useRpcQuery(getSystemResourcesRpc, EMPTY_PARAMS, {
    refetchInterval: 5000,
  });

  return (
    <View style={{ gap: 12, padding: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
        Host System Resources
      </Text>
      <Card variant="elevated">
        <KeyValueGroup>
          <KeyValue
            label="CPU"
            value={data?.cpuUsagePercent !== undefined ? `${data.cpuUsagePercent}%` : "--"}
          />
          <KeyValue
            label="Memory"
            value={
              data?.memoryUsedBytes !== undefined
                ? `${formatBytes(data.memoryUsedBytes, { compact: true, decimals: 1 })} (${data.memoryUsedPercent ?? "--"}%)`
                : "--"
            }
          />
          <KeyValue
            label="Load"
            value={data?.loadAvg?.[0] !== undefined ? data.loadAvg[0].toFixed(2) : "--"}
          />
          <KeyValue
            label="Uptime"
            value={data?.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--"}
          />
          <KeyValue label="Branch" value={data?.branch ?? "--"} copyable />
          <KeyValue
            label="MCP"
            value={
              data?.mcp && typeof data.mcp.total === "number"
                ? `${data.mcp.healthy}/${data.mcp.total} healthy`
                : "MCP --"
            }
          />
        </KeyValueGroup>
      </Card>
      {isLoading && !data ? (
        <Text style={{ fontSize: 12, color: colors.foregroundMuted }}>
          Loading live snapshot...
        </Text>
      ) : null}
    </View>
  );
}
