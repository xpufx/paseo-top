import { defineContract, defineSettingsContract, type RpcOutput } from "paseo-plugin-helper/shared";
import { z } from "zod";

export const getSystemResourcesRpc = defineContract({
  name: "system-resources.get",
  description: "Retrieve real-time host system resource metrics (CPU, RAM, load, uptime)",
  input: z.object({}),
  output: z.object({
    version: z.string(),
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

export const TopSettingsSchema = z.object({
  showCpuRam: z.boolean().default(true),
  showWorktree: z.boolean().default(true),
  showAgent: z.boolean().default(false),
  showLoad: z.boolean().default(false),
  showUptime: z.boolean().default(false),
  intervalSeconds: z.number().min(1).max(60).default(3),
});

export type TopSettings = z.infer<typeof TopSettingsSchema>;

export const topSettingsContract = defineSettingsContract({
  name: "top.settings",
  schema: TopSettingsSchema,
  description: "Paseo top composer pill and display settings",
});
