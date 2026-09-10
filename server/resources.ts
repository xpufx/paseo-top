import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import os from "node:os";
import {
  getSystemMetrics,
  createPluginLogger,
  PluginStorage,
  isPluginInstalled,
  isPluginRunning,
  CustomPillPoller,
  discoverCustomPillConfigs,
} from "paseo-plugin-helper/server";
import {
  type SystemResources,
  topSettingsContract,
  type TopSettings,
  type ResourceField,
  type McpResourceStatus,
  type McpStatusSnapshot,
  type CustomPillState,
  type CustomPillDefinition,
  type TopTimelineTelemetryData,
  type LiveUsage,
} from "../shared/resources";
import { PLUGIN_VERSION } from "../shared/version";

export const log = createPluginLogger("top", { version: PLUGIN_VERSION });

log.info("Initialized host system resources monitor", { version: PLUGIN_VERSION });

const CUSTOM_PILLS_DIR = path.join(os.homedir(), ".paseo", "top", "pills");

try {
  if (!fs.existsSync(CUSTOM_PILLS_DIR)) {
    fs.mkdirSync(CUSTOM_PILLS_DIR, { recursive: true });
    log.info("Created custom pills directory", { path: CUSTOM_PILLS_DIR });
  }

  const existingFiles = fs.readdirSync(CUSTOM_PILLS_DIR);
  if (existingFiles.length === 0) {
    const seedTemplates: Record<string, string> = {
      "disk-usage.jsonc.example": `// Free disk space on root partition
// Rename to disk-usage.jsonc to enable
{
  "id": "root-disk",
  "title": "Disk",
  "compactTitle": "Disk",
  "icon": "HardDrive",
  "command": "df -h / | awk 'NR==2 {print $4}'",
  "suffix": " free",
  "intervalMs": 10000,
  "timeoutMs": 3000,
  "modal": {
    "title": "Filesystem Disk Space",
    "description": "Output of df -h across mounted filesystems",
    "command": "df -h",
    "preformatted": true
  }
}
`,
      "docker-containers.jsonc.example": `// Count of running Docker containers
// Rename to docker-containers.jsonc to enable
{
  "id": "docker-containers",
  "title": "Docker",
  "compactTitle": "Docker",
  "icon": "Box",
  "command": "docker ps -q 2>/dev/null | wc -l",
  "suffix": " running",
  "intervalMs": 5000,
  "timeoutMs": 3000,
  "thresholds": {
    "warning": 10,
    "danger": 20
  },
  "modal": {
    "title": "Running Docker Containers",
    "description": "Live container status via docker ps",
    "command": "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
    "preformatted": true
  }
}
`,
      "gpu-nvidia.jsonc.example": `// NVIDIA GPU Utilization
// Rename to gpu-nvidia.jsonc to enable
{
  "id": "gpu-util",
  "title": "GPU",
  "compactTitle": "GPU",
  "icon": "Cpu",
  "command": "nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits",
  "suffix": "%",
  "intervalMs": 3000,
  "timeoutMs": 2000,
  "thresholds": {
    "warning": 70,
    "danger": 90
  },
  "modal": {
    "title": "GPU Vitals & Memory",
    "description": "Live hardware telemetry from nvidia-smi",
    "command": "nvidia-smi",
    "preformatted": true
  }
}
`,
    };

    for (const [filename, content] of Object.entries(seedTemplates)) {
      fs.writeFileSync(path.join(CUSTOM_PILLS_DIR, filename), content, "utf8");
    }
    log.info("Seeded sample custom pill templates", { count: Object.keys(seedTemplates).length });
  }
} catch (err) {
  log.warn("Failed to ensure custom pills directory", {
    error: err instanceof Error ? err.message : String(err),
  });
}

export const customPillPoller = new CustomPillPoller({
  configDir: CUSTOM_PILLS_DIR,
  logger: log,
});

const effectiveEnabled = new Set<string>();

export async function refreshCustomPillConfigs(): Promise<void> {
  try {
    const settings = await settingsStorage.readAsync();
    const overrides = settings.customPillEnabled ?? {};
    const discovered = await discoverCustomPillConfigs(CUSTOM_PILLS_DIR, log);
    const masterEnabled = settings.showCustomPills ?? true;
    const effective = discovered.map((pill) => {
      const override = overrides[pill.id];
      const enabled = masterEnabled && (override === undefined ? pill.enabled : override);
      return enabled === pill.enabled ? pill : { ...pill, enabled };
    });
    effectiveEnabled.clear();
    for (const pill of effective) {
      if (pill.enabled) effectiveEnabled.add(pill.id);
    }
    customPillPoller.updatePills(effective);
  } catch {
    // Directory might be temporarily inaccessible
  }
}

export async function handleGetCustomPills(): Promise<{ pills: CustomPillState[] }> {
  await refreshCustomPillConfigs();
  return {
    pills: customPillPoller
      .getAllStates()
      .filter((state) => effectiveEnabled.has(state.id)),
  };
}

export async function handleListCustomPills(): Promise<{ pills: CustomPillDefinition[] }> {
  const discovered = await discoverCustomPillConfigs(CUSTOM_PILLS_DIR, log);
  const settings = await settingsStorage.readAsync();
  const overrides = settings.customPillEnabled ?? {};
  const masterEnabled = settings.showCustomPills ?? true;
  return {
    pills: discovered.map((pill) => {
      const override = overrides[pill.id];
      const enabled = masterEnabled && (override === undefined ? pill.enabled : override);
      return enabled === pill.enabled ? pill : { ...pill, enabled };
    }),
  };
}

export async function handleRunCustomPillModalCommand(input: {
  pillId: string;
}): Promise<{ output?: string; error?: string }> {
  return customPillPoller.runModalCommand(input.pillId);
}

const settingsStorage = new PluginStorage<TopSettings>("top", "settings.json", {
  schema: topSettingsContract.schema,
});

const mcpStorage = new PluginStorage<McpStatusSnapshot>("mcp-tools", "status.json");

export async function handleGetSettings(): Promise<TopSettings> {
  const data = await settingsStorage.readAsync();
  log.info("Settings read requested", { settings: data });
  return data;
}

export async function handleUpdateSettings(patch: Partial<TopSettings>): Promise<TopSettings> {
  log.info("Settings update requested", { patch });
  const updated = await settingsStorage.updateAsync((prev) => ({ ...prev, ...patch }));
  log.info("Settings updated successfully", { updated });
  if (patch.customPillEnabled !== undefined || patch.showCustomPills !== undefined) {
    await refreshCustomPillConfigs();
  }
  return updated;
}

export async function handleResetSettings(): Promise<TopSettings> {
  log.info("Settings reset requested");
  settingsStorage.reset();
  return topSettingsContract.defaultSettings;
}

export function resolveGitBranch(dir?: string | null): string | null {
  if (!dir || typeof dir !== "string") return null;
  try {
    const gitPath = path.join(dir, ".git");
    if (!fs.existsSync(gitPath)) return null;

    let headFile: string | null = null;
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) {
      headFile = path.join(gitPath, "HEAD");
    } else if (stat.isFile()) {
      // Worktree pointer file: "gitdir: <path>"
      const content = fs.readFileSync(gitPath, "utf8").trim();
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match && match[1]) {
        const gitDir = path.resolve(dir, match[1]);
        headFile = path.join(gitDir, "HEAD");
      }
    }

    if (headFile && fs.existsSync(headFile)) {
      const headContent = fs.readFileSync(headFile, "utf8").trim();
      const branchMatch = headContent.match(/^ref:\s*refs\/heads\/(.+)$/);
      if (branchMatch && branchMatch[1]) {
        return branchMatch[1];
      }
      if (/^[0-9a-f]{7,40}$/i.test(headContent)) {
        return headContent.slice(0, 7);
      }
    }
  } catch {
    // Ignore and fall through to git command
  }

  try {
    const branch = child_process
      .execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: dir,
        timeout: 1500,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

export async function handleGetSystemResources(input?: {
  directory?: string;
  fields?: ResourceField[];
}): Promise<SystemResources> {
  const fields = input?.fields;
  const isSelective = Array.isArray(fields) && fields.length > 0;

  const needCpu = !isSelective || fields.includes("cpu");
  const needMem = !isSelective || fields.includes("memory");
  const needLoad = !isSelective || fields.includes("load");
  const needUptime = !isSelective || fields.includes("uptime");
  const needBranch = !isSelective || fields.includes("branch");
  const needMcp = !isSelective || fields.includes("mcp");

  const mcpRunning = await isPluginRunning("mcp-tools");
  const mcpInstalled = await isPluginInstalled("mcp-tools");

  let branch: string | null | undefined = undefined;
  if (needBranch) {
    branch = resolveGitBranch(input?.directory);
  }

  let cpuUsagePercent: number | undefined = undefined;
  let usedMem: number | undefined = undefined;
  let totalMem: number | undefined = undefined;
  let memoryUsedPercent: number | undefined = undefined;
  let loadAvg: number[] | undefined = undefined;
  let uptimeSeconds: number | undefined = undefined;

  let hostname: string | undefined = undefined;
  let platform: string | undefined = undefined;
  let arch: string | undefined = undefined;
  let cpuModel: string | undefined = undefined;
  let cpuCores: number | undefined = undefined;

  if (needCpu || !isSelective) {
    const metrics = getSystemMetrics();
    cpuUsagePercent = metrics.cpu.usagePercent;
    if (!isSelective) {
      hostname = metrics.hostname;
      platform = `${os.type()} ${os.release()}`;
      arch = metrics.arch;
      cpuModel = metrics.cpu.model;
      cpuCores = metrics.cpu.cores;
      loadAvg = metrics.cpu.loadAverage;
      uptimeSeconds = metrics.uptimeSeconds;
      totalMem = metrics.memory.totalBytes;
      usedMem = metrics.memory.usedBytes;
      memoryUsedPercent = Math.round(metrics.memory.usedPercent);
    }
  }

  if (needMem) {
    if (totalMem === undefined) {
      totalMem = os.totalmem();
      const freeMem = os.freemem();
      usedMem = totalMem - freeMem;
      memoryUsedPercent = Math.round((usedMem / totalMem) * 100);
    }

    if (process.platform === "linux") {
      try {
        const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
        const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
        if (match && match[1]) {
          const available = parseInt(match[1], 10) * 1024;
          usedMem = Math.max(0, totalMem - available);
          memoryUsedPercent = Math.round((usedMem / totalMem) * 100);
        }
      } catch {
        // Fallback to metrics.memory
      }
    }
  }

  if (needLoad && loadAvg === undefined) {
    loadAvg = os.loadavg();
  }

  if (needUptime && uptimeSeconds === undefined) {
    uptimeSeconds = Math.floor(os.uptime());
  }

  let mcp: McpResourceStatus | null = null;
  if (needMcp && mcpRunning && mcpStorage.exists()) {
    try {
      const snapshot = await mcpStorage.readAsync();
      if (snapshot && typeof snapshot.updatedAt === "string" && Array.isArray(snapshot.servers)) {
        const isStale = Date.now() - new Date(snapshot.updatedAt).getTime() > 60_000;
        mcp = {
          updatedAt: snapshot.updatedAt,
          total: typeof snapshot.total === "number" ? snapshot.total : snapshot.servers.length,
          healthy: typeof snapshot.healthy === "number" ? snapshot.healthy : 0,
          degraded: typeof snapshot.degraded === "number" ? snapshot.degraded : 0,
          down: typeof snapshot.down === "number" ? snapshot.down : 0,
          isStale,
          servers: snapshot.servers,
        };
      }
    } catch {
      mcp = null;
    }
  }

  if (!mcpRunning) {
    mcp = null;
  }

  return {
    version: PLUGIN_VERSION,
    hostname,
    platform,
    arch,
    cpuModel,
    cpuCores,
    cpuUsagePercent,
    memoryUsedBytes: usedMem,
    memoryTotalBytes: totalMem,
    memoryUsedPercent,
    loadAvg,
    uptimeSeconds,
    branch,
    mcp,
    mcpInstalled,
    customPills: customPillPoller
      .getAllStates()
      .filter((state) => effectiveEnabled.has(state.id)),
    lastTurn: lastTurnTelemetry,
    liveUsage: lastLiveUsage,
  };
}

export interface GitDiffStat {
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export function parseGitDiffShortstat(output: string): GitDiffStat | null {
  const match = output.match(/(\d+)\s+files? changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
  if (!match) return null;
  return {
    filesChanged: parseInt(match[1], 10),
    insertions: match[2] ? parseInt(match[2], 10) : 0,
    deletions: match[3] ? parseInt(match[3], 10) : 0,
  };
}

export function collectGitDiffStat(cwd: string): GitDiffStat | null {
  try {
    const output = child_process.execSync("git diff --shortstat", {
      cwd,
      timeout: 2000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = output.trim();
    if (!trimmed) return { insertions: 0, deletions: 0, filesChanged: 0 };
    return parseGitDiffShortstat(trimmed);
  } catch {
    return null;
  }
}

export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  costUsd?: number;
}

export interface TurnActivity {
  toolCalls: number;
  toolErrors: number;
  usage?: TurnUsage;
}

function readUsageRecord(record: unknown): TurnUsage | undefined {
  if (!record || typeof record !== "object") return undefined;
  const r = record as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const usage: TurnUsage = {
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    contextUsedTokens: num(r.contextUsedTokens),
    contextMaxTokens: num(r.contextWindowMaxTokens ?? r.contextMaxTokens),
    costUsd: num(r.totalCostUsd ?? r.costUsd),
  };
  if (
    usage.inputTokens === undefined &&
    usage.outputTokens === undefined &&
    usage.contextUsedTokens === undefined &&
    usage.costUsd === undefined
  ) {
    return undefined;
  }
  return usage;
}

export function summarizeTurnTimeline(timeline: readonly unknown[]): TurnActivity {
  let toolCalls = 0;
  let toolErrors = 0;
  let usage: TurnUsage | undefined;
  for (const item of timeline) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    if (type === "tool_call") {
      toolCalls++;
      const detail = row.detail as Record<string, unknown> | undefined;
      const status = row.status ?? detail?.status;
      if (status === "failed" || status === "error") toolErrors++;
    }
    if (type === "usage_updated" || type === "turn_completed") {
      const found = readUsageRecord(row.usage ?? row.detail);
      if (found) usage = { ...usage, ...found };
    }
  }
  return { toolCalls, toolErrors, usage };
}

let lastTurnTelemetry: TopTimelineTelemetryData | null = null;

let lastLiveUsage: LiveUsage | null = null;

export function getLastTurnTelemetry(): TopTimelineTelemetryData | null {
  return lastTurnTelemetry;
}

export function setLastLiveUsage(usage: LiveUsage | null): void {
  if (usage) {
    lastLiveUsage = usage;
  }
}

export function getLastLiveUsage(): LiveUsage | null {
  return lastLiveUsage;
}

export async function collectTurnTelemetry(
  turnId: string | null,
  agentId: string,
  outcome: {
    kind: "completed" | "failed" | "canceled";
    error?: { message: string; code?: string };
    reason?: string;
  },
  durationMs?: number,
  extra?: {
    cwd?: string | null;
    provider?: string | null;
    title?: string | null;
    model?: string | null;
    timeline?: readonly unknown[];
    gitBefore?: GitDiffStat | null;
    mcpRunning?: boolean;
    mcpInstalled?: boolean;
  },
): Promise<TopTimelineTelemetryData> {
  const metrics = getSystemMetrics();
  let totalMem = metrics.memory.totalBytes;
  let usedMem = metrics.memory.usedBytes;
  let memPercent = Math.round(metrics.memory.usedPercent);

  if (process.platform === "linux") {
    try {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match && match[1]) {
        const available = parseInt(match[1], 10) * 1024;
        usedMem = Math.max(0, totalMem - available);
        memPercent = Math.round((usedMem / totalMem) * 100);
      }
    } catch {
      // Fallback to metrics.memory
    }
  }

  const loadAvg = os.loadavg();
  const loadAvg1m = loadAvg.length > 0 ? Math.round(loadAvg[0] * 100) / 100 : 0;

  let mcpHealthy: number | undefined;
  let mcpTotal: number | undefined;
  // Gate on live plugin state, not just the snapshot file: after mcp-tools
  // is removed its status.json stays on disk and would otherwise bake stale
  // counts into every new timeline item. Same check as the live RPC path.
  const mcpRunning = extra?.mcpRunning ?? (await isPluginRunning("mcp-tools"));
  const mcpInstalled = extra?.mcpInstalled ?? (await isPluginInstalled("mcp-tools"));
  if (mcpRunning && mcpStorage.exists()) {
    try {
      const snap = await mcpStorage.readAsync();
      if (snap && typeof snap.total === "number") {
        mcpTotal = snap.total;
        mcpHealthy = snap.healthy;
      }
    } catch {
      // Ignore
    }
  }

  let outcomeError: string | undefined;
  if (outcome.kind === "failed" && outcome.error) {
    outcomeError = outcome.error.message;
  } else if (outcome.kind === "canceled" && outcome.reason) {
    outcomeError = outcome.reason;
  }

  const cwd = extra?.cwd ?? null;
  const branch = resolveGitBranch(cwd);
  const uptimeSeconds = Math.floor(os.uptime());

  let gitInsertions: number | undefined;
  let gitDeletions: number | undefined;
  let gitFilesChanged: number | undefined;
  if (cwd) {
    const before = extra?.gitBefore ?? null;
    const after = collectGitDiffStat(cwd);
    if (after) {
      gitInsertions = Math.max(0, after.insertions - (before?.insertions ?? 0));
      gitDeletions = Math.max(0, after.deletions - (before?.deletions ?? 0));
      gitFilesChanged = after.filesChanged;
    }
  }

  let toolCalls: number | undefined;
  let toolErrors: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let contextUsedTokens: number | undefined;
  let contextMaxTokens: number | undefined;
  let costUsd: number | undefined;
  if (extra?.timeline) {
    const activity = summarizeTurnTimeline(extra.timeline);
    toolCalls = activity.toolCalls;
    toolErrors = activity.toolErrors;
    inputTokens = activity.usage?.inputTokens;
    outputTokens = activity.usage?.outputTokens;
    contextUsedTokens = activity.usage?.contextUsedTokens;
    contextMaxTokens = activity.usage?.contextMaxTokens;
    costUsd = activity.usage?.costUsd;
  }

  const data: TopTimelineTelemetryData = {
    turnId,
    agentId,
    outcomeKind: outcome.kind,
    outcomeError,
    timestamp: new Date().toISOString(),
    durationMs,
    cpuPercent: Math.round(metrics.cpu.usagePercent),
    memUsedBytes: usedMem,
    memTotalBytes: totalMem,
    memPercent,
    loadAvg1m,
    mcpHealthy,
    mcpTotal,
    mcpInstalled,
    branch,
    worktree: cwd,
    agentTitle: extra?.title ?? null,
    agentModel: extra?.model ?? null,
    agentProvider: extra?.provider ?? null,
    uptimeSeconds,
    gitInsertions,
    gitDeletions,
    gitFilesChanged,
    toolCalls,
    toolErrors,
    inputTokens,
    outputTokens,
    contextUsedTokens,
    contextMaxTokens,
    costUsd,
  };
  lastTurnTelemetry = data;
  return data;
}
