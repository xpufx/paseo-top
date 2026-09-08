import {
  defineContract,
  defineSettingsContract,
  type RpcOutput,
  type CustomPillState,
} from "paseo-plugin-helper/shared";
import { z } from "zod";

export type { CustomPillState };

export const ResourceFieldSchema = z.enum(["cpu", "memory", "load", "uptime", "branch", "mcp"]);
export type ResourceField = z.infer<typeof ResourceFieldSchema>;

export const McpServerStatusSchema = z.object({
  name: z.string(),
  status: z.enum(["healthy", "degraded", "down", "unknown"]),
  latencyMs: z.number(),
});
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;

export interface McpStatusSnapshot {
  updatedAt: string;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  servers: McpServerStatus[];
}

export const McpResourceStatusSchema = z.object({
  updatedAt: z.string(),
  total: z.number(),
  healthy: z.number(),
  degraded: z.number(),
  down: z.number(),
  isStale: z.boolean(),
  servers: z.array(McpServerStatusSchema),
});
export type McpResourceStatus = z.infer<typeof McpResourceStatusSchema>;

export const CustomPillStateSchema = z.object({
  id: z.string(),
  sourceFile: z.string().optional(),
  title: z.string(),
  compactTitle: z.string().optional(),
  icon: z.string().optional(),
  compactIcon: z.string().optional(),
  rawValue: z.string(),
  displayValue: z.string(),
  numericValue: z.number().optional(),
  status: z.enum(["neutral", "success", "warning", "danger", "accent", "info"]),
  lastUpdated: z.number(),
  error: z.string().optional(),
  modalTitle: z.string().optional(),
  modalDescription: z.string().optional(),
  modalOutput: z.string().optional(),
  modalError: z.string().optional(),
  modalLastUpdated: z.number().optional(),
});
export type CustomPillStateOutput = z.infer<typeof CustomPillStateSchema>;

export const getCustomPillsRpc = defineContract({
  name: "top.custom-pills.get",
  description: "Retrieve live states of all discovered custom metric pills",
  input: z.object({}).default({}),
  output: z.object({
    pills: z.array(CustomPillStateSchema),
  }),
});

export const runCustomPillModalCommandRpc = defineContract({
  name: "top.custom-pills.modal-command",
  description: "Execute the on-demand drilldown command for a custom metric pill",
  input: z.object({
    pillId: z.string(),
  }),
  output: z.object({
    output: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const CustomPillDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceFile: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CustomPillDefinition = z.infer<typeof CustomPillDefinitionSchema>;

export const listCustomPillsRpc = defineContract({
  name: "top.custom-pills.list",
  description: "List all discovered custom metric pill definitions",
  input: z.object({}).default({}),
  output: z.object({
    pills: z.array(CustomPillDefinitionSchema),
  }),
});

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
    mcp: McpResourceStatusSchema.nullable().optional(),
    mcpInstalled: z.boolean().optional(),
    customPills: z.array(CustomPillStateSchema).optional(),
  }),
});

export type SystemResources = RpcOutput<typeof getSystemResourcesRpc>;

export const PillModeSchema = z.enum(["cycle", "all", "multiple"]).default("cycle");
export type PillMode = z.infer<typeof PillModeSchema>;

export const TopSettingsSchema = z.object({
  pillMode: PillModeSchema,
  showCpuRam: z.boolean().default(true),
  showBranch: z.boolean().default(true),
  showWorktree: z.boolean().default(true),
  showAgentTitle: z.boolean().default(false),
  showAgent: z.boolean().default(false),
  showAgentProvider: z.boolean().default(false),
  showAgentActivity: z.boolean().default(false),
  showAgentId: z.boolean().default(true),
  showLoad: z.boolean().default(false),
  showUptime: z.boolean().default(false),
  showMcp: z.boolean().default(true),
  mcp: z.boolean().default(true),
  showCustomPills: z.boolean().default(true),
  customPillEnabled: z.record(z.string(), z.boolean()).default({}),
  recordTurnTelemetry: z.boolean().default(true),
  intervalSeconds: z.number().min(1).max(60).default(3),
  defaultTab: z.enum(["system", "context", "settings", "about"]).default("system"),
});

export type TopSettings = z.infer<typeof TopSettingsSchema>;

export const topSettingsContract = defineSettingsContract({
  name: "top.settings",
  schema: TopSettingsSchema,
  description: "Paseo top composer pill and display settings",
});

export const topTimelineTelemetrySchema = z.object({
  turnId: z.string().nullable(),
  agentId: z.string(),
  outcomeKind: z.enum(["completed", "failed", "canceled"]),
  outcomeError: z.string().optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
  cpuPercent: z.number(),
  memUsedBytes: z.number(),
  memTotalBytes: z.number(),
  memPercent: z.number(),
  loadAvg1m: z.number(),
  mcpHealthy: z.number().optional(),
  mcpTotal: z.number().optional(),
});
export type TopTimelineTelemetryData = z.infer<typeof topTimelineTelemetrySchema>;

export const TOP_TIMELINE_KIND = "top-turn-telemetry";
export const TOP_TIMELINE_VERSION = 1;
