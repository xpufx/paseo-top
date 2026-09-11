import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllLabel,
  enabledItemsForSettings,
  extractTokenMetrics,
  formatCompactTokens,
  formatSegmentLabel,
  formatTokensLabel,
  nextCycleItem,
  resetCycleState,
} from "./pill-labels";
import { topSettingsContract } from "../shared/resources";

const baseSettings = topSettingsContract.defaultSettings;

test("single mode resolver: current segment text", () => {
  assert.equal(
    formatSegmentLabel("cpu_ram", {
      data: { memoryUsedBytes: 1024 ** 3, cpuUsagePercent: 42 } as never,
    }),
    "42% · 1.0G",
  );
  assert.equal(formatSegmentLabel("branch", { data: { branch: "main" } as never }), "main");
  assert.equal(
    formatSegmentLabel("agent_id", { agentId: "abcdef123456" }),
    "abcdef1",
  );
  assert.equal(
    formatSegmentLabel("load", { data: { loadAvg: [1.234] } as never }),
    "load 1.23",
  );
  assert.equal(
    formatSegmentLabel("mcp", {
      data: { mcp: { healthy: 3, total: 4 } } as never,
    }),
    "3/4 MCP",
  );
});

test("multiple mode resolvers: per-pill labels differ per item", () => {
  const snap = {
    data: {
      branch: "v0.8",
      cpuUsagePercent: 10,
      memoryUsedBytes: 512 * 1024 ** 2,
      loadAvg: [0.5],
    } as never,
    worktreeLocationText: "money-lion",
  };
  const cpu = formatSegmentLabel("cpu_ram", snap);
  const branch = formatSegmentLabel("branch", snap);
  const worktree = formatSegmentLabel("worktree", snap);
  const load = formatSegmentLabel("load", snap);
  assert.match(cpu, /10%/);
  assert.equal(branch, "v0.8");
  assert.equal(worktree, "money-lion");
  assert.match(load, /0\.50/);
  assert.notEqual(cpu, branch);
});

test("turns label formats count and placeholder", () => {
  assert.equal(
    formatSegmentLabel("turns", { data: { lastTurn: { turnCount: 14 } } as never }),
    "turns 14",
  );
  assert.equal(formatSegmentLabel("turns", { data: {} as never }), "turns --");
  assert.equal(formatSegmentLabel("turns", {}), "turns --");
});

test("cycle mode resolver: advances rotation index per call", () => {
  resetCycleState();
  const items = ["cpu_ram", "branch", "load"] as const;
  assert.equal(nextCycleItem("a1", [...items]), "cpu_ram");
  assert.equal(nextCycleItem("a1", [...items]), "branch");
  assert.equal(nextCycleItem("a1", [...items]), "load");
  assert.equal(nextCycleItem("a1", [...items]), "cpu_ram");
  assert.equal(nextCycleItem("other-agent", [...items]), "cpu_ram");
  assert.equal(nextCycleItem("a1", []), undefined);
});

test("all mode resolver: joined segment text", () => {
  const snap = {
    data: {
      branch: "v0.8",
      cpuUsagePercent: 10,
      memoryUsedBytes: 512 * 1024 ** 2,
    } as never,
    worktreeLocationText: "money-lion",
  };
  const label = buildAllLabel(["cpu_ram", "branch"], snap);
  assert.match(label, /\|/);
  assert.match(label, /v0\.8/);
  assert.match(label, /10%/);
});

test("enabled items follow pill surface selectors", () => {
  const items = enabledItemsForSettings(baseSettings);
  assert.ok(items.includes("cpu_ram"));
  assert.ok(items.includes("branch"));
});

test("formatCompactTokens formats standard human-readable token quantities", () => {
  assert.equal(formatCompactTokens(0), "0");
  assert.equal(formatCompactTokens(888), "888");
  assert.equal(formatCompactTokens(1000), "1k");
  assert.equal(formatCompactTokens(1500), "1.5k");
  assert.equal(formatCompactTokens(58000), "58k");
  assert.equal(formatCompactTokens(128000), "128k");
  assert.equal(formatCompactTokens(1000000), "1M");
  assert.equal(formatCompactTokens(1500000), "1.5M");
  assert.equal(formatCompactTokens(20000000), "20M");
});

test("formatTokensLabel formats clean token and context strings", () => {
  // Context used and max
  assert.equal(
    formatTokensLabel({ contextUsedTokens: 58000, contextMaxTokens: 1000000 }),
    "58k/1M",
  );
  // Context used without max
  assert.equal(formatTokensLabel({ contextUsedTokens: 58000 }), "58k ctx");
  // Total tokens
  assert.equal(formatTokensLabel({ totalTokens: 888 }), "888 tok");
  assert.equal(formatTokensLabel({ totalTokens: 58000 }), "58k tok");
  // Null / empty
  assert.equal(formatTokensLabel(null, "tok"), "tok --");
  assert.equal(formatTokensLabel(null, ""), "--");
});

test("formatSegmentLabel tokens falls back through liveUsage, lastTurn, and agent.lastUsage", () => {
  // Empty
  assert.equal(formatSegmentLabel("tokens", {}), "tok --");
  assert.equal(formatSegmentLabel("tokens", { data: {} as never }), "tok --");

  // Fallback to agent.lastUsage
  assert.equal(
    formatSegmentLabel("tokens", {
      agent: {
        lastUsage: { inputTokens: 500, outputTokens: 388 },
      },
    }),
    "888 tok",
  );

  // Fallback to agent.lastUsage context window
  assert.equal(
    formatSegmentLabel("tokens", {
      agent: {
        lastUsage: {
          contextWindowUsedTokens: 58000,
          contextWindowMaxTokens: 1000000,
        },
      },
    }),
    "58k/1M",
  );

  // Fallback to agent.lastUsage context used only
  assert.equal(
    formatSegmentLabel("tokens", {
      agent: {
        lastUsage: {
          contextWindowUsedTokens: 58000,
        },
      },
    }),
    "58k ctx",
  );

  // liveUsage takes precedence over agent.lastUsage
  assert.equal(
    formatSegmentLabel("tokens", {
      data: {
        liveUsage: {
          contextWindowUsedTokens: 120000,
          contextWindowMaxTokens: 2000000,
        },
      } as never,
      agent: {
        lastUsage: {
          contextWindowUsedTokens: 58000,
          contextWindowMaxTokens: 1000000,
        },
      },
    }),
    "120k/2M",
  );

  // Never renders bare prefix 'tok' when numbers exist
  const withTokens = formatSegmentLabel("tokens", {
    agent: { lastUsage: { inputTokens: 42 } },
  });
  assert.notEqual(withTokens, "tok");
  assert.notEqual(withTokens, "tok ");
  assert.equal(withTokens, "42 tok");
});
