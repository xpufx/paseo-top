import { defineRpc, type RpcOutput } from "@getpaseo/plugin";
import { z } from "zod";

export const getSystemResourcesRpc = defineRpc({
  name: "system-resources.get",
  input: z.object({}),
  output: z.object({
    hostname: z.string(),
    platform: z.string(),
    arch: z.string(),
    cpuModel: z.string(),
    cpuCores: z.number(),
    cpuUsagePercent: z.number(),
    memoryUsedBytes: z.number(),
    memoryTotalBytes: z.number(),
    memoryUsedPercent: z.number(),
    loadAvg: z.array(z.number()),
    uptimeSeconds: z.number(),
  }),
});

export type SystemResources = RpcOutput<typeof getSystemResourcesRpc>;
