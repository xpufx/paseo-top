import fs from "node:fs";
import os from "node:os";
import {
  getSystemMetrics,
  resolvePluginVersion,
  createPluginLogger,
} from "paseo-plugin-helper/server";
import type { SystemResources } from "./resources.shared";

export const log = createPluginLogger("top");
const pluginVersion = resolvePluginVersion();

log.info("Initialized host system resources monitor", { version: pluginVersion });

export async function handleGetSystemResources(): Promise<SystemResources> {
  const metrics = getSystemMetrics();

  let usedMem = metrics.memory.usedBytes;
  const totalMem = metrics.memory.totalBytes;
  let memoryUsedPercent = Math.round(metrics.memory.usedPercent);

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

  if (memoryUsedPercent >= 90) {
    log.warn("Memory threshold critical", { usedPercent: memoryUsedPercent });
  }

  return {
    version: pluginVersion,
    hostname: metrics.hostname,
    platform: `${os.type()} ${os.release()}`,
    arch: metrics.arch,
    cpuModel: metrics.cpu.model,
    cpuCores: metrics.cpu.cores,
    cpuUsagePercent: metrics.cpu.usagePercent,
    memoryUsedBytes: usedMem,
    memoryTotalBytes: totalMem,
    memoryUsedPercent,
    loadAvg: metrics.cpu.loadAverage,
    uptimeSeconds: metrics.uptimeSeconds,
  };
}
