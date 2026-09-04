import fs from "node:fs";
import os from "node:os";
import type { SystemResources } from "../shared/resources";

interface CpuSnapshot {
  idle: number;
  total: number;
}

function getCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

let lastSnapshot = getCpuSnapshot();
let currentCpuPercent = 0;

// Continuously sample CPU usage every 1s
const ticker = setInterval(() => {
  const current = getCpuSnapshot();
  const idleDiff = current.idle - lastSnapshot.idle;
  const totalDiff = current.total - lastSnapshot.total;
  if (totalDiff > 0) {
    currentCpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)));
  }
  lastSnapshot = current;
}, 1000);

if (typeof ticker.unref === "function") {
  ticker.unref();
}

export async function handleGetSystemResources(): Promise<SystemResources> {
  const totalMem = os.totalmem();
  let availableMem = os.freemem();

  if (process.platform === "linux") {
    try {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match && match[1]) {
        availableMem = parseInt(match[1], 10) * 1024;
      }
    } catch {
      // Fallback to freemem
    }
  }

  const usedMem = Math.max(0, totalMem - availableMem);
  const memoryUsedPercent = Math.round((usedMem / totalMem) * 100);
  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? "Unknown CPU",
    cpuCores: cpus.length,
    cpuUsagePercent: currentCpuPercent,
    memoryUsedBytes: usedMem,
    memoryTotalBytes: totalMem,
    memoryUsedPercent,
    loadAvg: os.loadavg(),
    uptimeSeconds: Math.floor(os.uptime()),
  };
}
