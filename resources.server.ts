import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import os from "node:os";
import {
  getSystemMetrics,
  createPluginLogger,
  PluginStorage,
} from "paseo-plugin-helper/server";
import {
  type SystemResources,
  topSettingsContract,
  type TopSettings,
  type ResourceField,
} from "./resources.shared";
import { PLUGIN_VERSION } from "./version";

export const log = createPluginLogger("top", { version: PLUGIN_VERSION });

log.info("Initialized host system resources monitor", { version: PLUGIN_VERSION });

const settingsStorage = new PluginStorage<TopSettings>("top", "settings.json", {
  schema: topSettingsContract.schema,
});

export async function handleGetSettings(): Promise<TopSettings> {
  const data = await settingsStorage.readAsync();
  log.info("Settings read requested", { settings: data });
  return data;
}

export async function handleUpdateSettings(patch: Partial<TopSettings>): Promise<TopSettings> {
  log.info("Settings update requested", { patch });
  const updated = await settingsStorage.updateAsync((prev) => ({ ...prev, ...patch }));
  log.info("Settings updated successfully", { updated });
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
  };
}
