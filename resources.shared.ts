import { defineContract, defineSettingsContract, type RpcOutput } from "paseo-plugin-helper/shared";
import { z } from "zod";

export const ResourceFieldSchema = z.enum(["cpu", "memory", "load", "uptime", "branch"]);
export type ResourceField = z.infer<typeof ResourceFieldSchema>;

export const getSystemResourcesRpc = defineContract({
  name: "system-resources.get",
  description: "Retrieve real-time host system resource metrics (CPU, RAM, load, uptime)",
  input: z
    .object({
      directory: z.string().optional(),
      fields: z.array(ResourceFieldSchema).optional(),
    })
    .default({}),
  output: z.object({
    version: z.string(),
    hostname: z.string().optional(),
    platform: z.string().optional(),
    arch: z.string().optional(),
    cpuModel: z.string().optional(),
    cpuCores: z.number().optional(),
    cpuUsagePercent: z.number().optional(),
    memoryUsedBytes: z.number().optional(),
    memoryTotalBytes: z.number().optional(),
    memoryUsedPercent: z.number().optional(),
    loadAvg: z.array(z.number()).optional(),
    uptimeSeconds: z.number().optional(),
    branch: z.string().nullable().optional(),
  }),
});

export type SystemResources = RpcOutput<typeof getSystemResourcesRpc>;

export const TopSettingsSchema = z.object({
  showCpuRam: z.boolean().default(true),
  showBranch: z.boolean().default(true),
  showWorktree: z.boolean().default(true),
  showAgent: z.boolean().default(false),
  showLoad: z.boolean().default(false),
  showUptime: z.boolean().default(false),
  intervalSeconds: z.number().min(1).max(60).default(3),
  defaultTab: z.enum(["system", "context", "settings"]).default("system"),
});

export type TopSettings = z.infer<typeof TopSettingsSchema>;

export const topSettingsContract = defineSettingsContract({
  name: "top.settings",
  schema: TopSettingsSchema,
  description: "Paseo top composer pill and display settings",
});
