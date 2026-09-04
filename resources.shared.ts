import { defineContract, type RpcOutput } from "paseo-plugin-helper/shared";
import { z } from "zod";

export const getSystemResourcesRpc = defineContract({
  name: "system-resources.get",
  description: "Retrieve real-time host system resource metrics (CPU, RAM, load, uptime)",
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
