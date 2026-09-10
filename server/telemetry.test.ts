import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  topTimelineTelemetrySchema,
  TopSettingsSchema,
  TOP_TIMELINE_KIND,
  TOP_TIMELINE_VERSION,
  METRIC_IDS,
  METRIC_DEFINITIONS,
  PILL_RENDERED_METRICS,
  TIMELINE_RENDERED_METRICS,
  DEFAULT_METRIC_SURFACES,
  isMcpSurfaceEnabled,
} from "../shared/resources";
import { collectTurnTelemetry, customPillPoller, parseGitDiffShortstat, summarizeTurnTimeline } from "./resources";

after(() => {
  customPillPoller.stop();
});

test("topTimelineTelemetrySchema parses completed turn data", () => {
  const sample = {
    turnId: "turn-123",
    agentId: "agent-abc",
    outcomeKind: "completed" as const,
    timestamp: new Date().toISOString(),
    durationMs: 1450,
    cpuPercent: 24,
    memUsedBytes: 4294967296,
    memTotalBytes: 17179869184,
    memPercent: 25,
    loadAvg1m: 0.85,
    mcpHealthy: 4,
    mcpTotal: 4,
  };

  const parsed = topTimelineTelemetrySchema.parse(sample);
  assert.equal(parsed.turnId, "turn-123");
  assert.equal(parsed.outcomeKind, "completed");
  assert.equal(parsed.cpuPercent, 24);
  assert.equal(parsed.durationMs, 1450);
});

test("topTimelineTelemetrySchema parses failed turn with error message", () => {
  const sample = {
    turnId: "turn-456",
    agentId: "agent-def",
    outcomeKind: "failed" as const,
    outcomeError: "Out of memory",
    timestamp: new Date().toISOString(),
    durationMs: 3200,
    cpuPercent: 99,
    memUsedBytes: 16000000000,
    memTotalBytes: 17179869184,
    memPercent: 93,
    loadAvg1m: 4.12,
  };

  const parsed = topTimelineTelemetrySchema.parse(sample);
  assert.equal(parsed.turnId, "turn-456");
  assert.equal(parsed.outcomeKind, "failed");
  assert.equal(parsed.outcomeError, "Out of memory");
});

test("topTimelineTelemetrySchema rejects invalid outcome kind", () => {
  assert.throws(() => {
    topTimelineTelemetrySchema.parse({
      turnId: "turn-789",
      agentId: "agent-ghi",
      outcomeKind: "unknown",
      timestamp: new Date().toISOString(),
      cpuPercent: 10,
      memUsedBytes: 1000,
      memTotalBytes: 2000,
      memPercent: 50,
      loadAvg1m: 0.1,
    });
  });
});

test("TopSettingsSchema migrates to per-metric surfaces with sane defaults", () => {
  const defaults = TopSettingsSchema.parse({});
  assert.equal(defaults.metricSurfaces.cpu_ram, "both");
  assert.equal(defaults.metricSurfaces.changes, "timeline");
  assert.equal(defaults.metricSurfaces.tokens, "timeline");

  const legacy = TopSettingsSchema.parse({ showCpuRam: false, recordTurnTelemetry: false });
  assert.equal(legacy.metricSurfaces.cpu_ram, "none");
  assert.equal(legacy.metricSurfaces.load, "none");

  const legacyOn = TopSettingsSchema.parse({ showCpuRam: true, recordTurnTelemetry: true });
  assert.equal(legacyOn.metricSurfaces.cpu_ram, "both");
  assert.equal(legacyOn.metricSurfaces.load, "timeline");
});

test("collectTurnTelemetry returns valid telemetry data matching schema", async () => {
  const telemetry = await collectTurnTelemetry(
    "turn-live-1",
    "agent-test",
    { kind: "completed" },
    500,
  );

  const validated = topTimelineTelemetrySchema.parse(telemetry);
  assert.equal(validated.turnId, "turn-live-1");
  assert.equal(validated.agentId, "agent-test");
  assert.equal(validated.outcomeKind, "completed");
  assert.equal(validated.durationMs, 500);
  assert.equal(typeof validated.cpuPercent, "number");
  assert.equal(typeof validated.memPercent, "number");
  assert.equal(typeof validated.loadAvg1m, "number");
});

test("timeline constants are correctly defined", () => {
  assert.equal(TOP_TIMELINE_KIND, "top-turn-telemetry");
  assert.equal(TOP_TIMELINE_VERSION, 1);
});

test("every offered metric renders somewhere (no offered-but-invisible gaps)", () => {
  for (const def of METRIC_DEFINITIONS) {
    if (def.pillOnly) continue;
    const visible =
      PILL_RENDERED_METRICS.includes(def.id) ||
      TIMELINE_RENDERED_METRICS.includes(def.id);
    assert.equal(
      visible,
      true,
      `metric ${def.id} is offered in settings but renders nowhere`,
    );
  }
  for (const id of TIMELINE_RENDERED_METRICS) {
    const def = METRIC_DEFINITIONS.find((d) => d.id === id);
    assert.ok(def, `timeline registry references unknown metric ${id}`);
    assert.equal(
      def.pillOnly,
      undefined,
      `pill-only metric ${id} must not be in the timeline registry`,
    );
  }
  for (const id of PILL_RENDERED_METRICS) {
    const def = METRIC_DEFINITIONS.find((d) => d.id === id);
    assert.ok(def, `pill registry references unknown metric ${id}`);
  }
  for (const id of METRIC_IDS) {
    assert.ok(
      TIMELINE_RENDERED_METRICS.includes(id) || PILL_RENDERED_METRICS.includes(id),
      `metric id ${id} renders nowhere`,
    );
  }
  for (const id of METRIC_IDS) {
    assert.ok(
      id in DEFAULT_METRIC_SURFACES,
      `metric id ${id} has no default surface selector`,
    );
  }
  assert.deepEqual(
    [...METRIC_IDS].sort(),
    METRIC_DEFINITIONS.map((d) => d.id).sort(),
    "every metric id needs a settings definition",
  );
});

test("collectTurnTelemetry passes model and provider through without fabrication", async () => {
  const withBoth = await collectTurnTelemetry(
    "turn-model-1",
    "agent-test",
    { kind: "completed" },
    100,
    { provider: "openai", model: "gpt-5", title: "T" },
  );
  assert.equal(withBoth.agentModel, "gpt-5");
  assert.equal(withBoth.agentProvider, "openai");

  const withNeither = await collectTurnTelemetry(
    "turn-model-2",
    "agent-test",
    { kind: "completed" },
    100,
  );
  assert.equal(withNeither.agentModel, null);
  assert.equal(withNeither.agentProvider, null);
});

test("collectTurnTelemetry omits MCP fields when mcp-tools is not running", async () => {
  const telemetry = await collectTurnTelemetry(
    "turn-mcp-gone",
    "agent-test",
    { kind: "completed" },
    100,
    { mcpRunning: false, mcpInstalled: false },
  );
  assert.equal(telemetry.mcpHealthy, undefined);
  assert.equal(telemetry.mcpTotal, undefined);
  assert.equal(telemetry.mcpInstalled, false);
  topTimelineTelemetrySchema.parse(telemetry);
});

test("legacy timeline items without mcpInstalled still parse", () => {  const parsed = topTimelineTelemetrySchema.parse({
    turnId: "turn-legacy-1",
    agentId: "agent-test",
    outcomeKind: "completed",
    timestamp: new Date().toISOString(),
    cpuPercent: 10,
    memUsedBytes: 1000,
    memTotalBytes: 2000,
    memPercent: 50,
    loadAvg1m: 0.5,
    mcpHealthy: 3,
    mcpTotal: 3,
  });
  assert.equal(parsed.mcpInstalled, undefined);
});

test("isMcpSurfaceEnabled gates the mcp surface on positive presence", () => {
  const both = { metricSurfaces: { mcp: "both" as const } };
  const none = { metricSurfaces: { mcp: "none" as const } };
  assert.equal(isMcpSurfaceEnabled(both, "pill", true), true);
  assert.equal(isMcpSurfaceEnabled(both, "timeline", true), true);
  assert.equal(isMcpSurfaceEnabled(none, "pill", true), false);
  assert.equal(isMcpSurfaceEnabled(none, "timeline", true), false);
  assert.equal(isMcpSurfaceEnabled(both, "pill", false), false);
  assert.equal(isMcpSurfaceEnabled(both, "timeline", false), false);
  assert.equal(isMcpSurfaceEnabled(both, "pill", undefined), false);
  assert.equal(isMcpSurfaceEnabled(both, "timeline", undefined), false);
  assert.equal(isMcpSurfaceEnabled({}, "timeline", true), true);
  assert.equal(isMcpSurfaceEnabled({ showMcp: false }, "pill", true), false);
});

test("parseGitDiffShortstat parses insertions, deletions, and files", () => {
  assert.deepEqual(parseGitDiffShortstat("3 files changed, 40 insertions(+), 12 deletions(-)"), {
    filesChanged: 3,
    insertions: 40,
    deletions: 12,
  });
  assert.deepEqual(parseGitDiffShortstat("1 file changed, 5 insertions(+)"), {
    filesChanged: 1,
    insertions: 5,
    deletions: 0,
  });
  assert.equal(parseGitDiffShortstat("nothing to commit"), null);
});

test("summarizeTurnTimeline counts tools and extracts usage", () => {
  const activity = summarizeTurnTimeline([
    { type: "tool_call", name: "bash", status: "success" },
    { type: "tool_call", name: "read", status: "failed" },
    { type: "assistant_message", text: "hi" },
    { type: "usage_updated", usage: { inputTokens: 100, outputTokens: 50 } },
  ]);
  assert.equal(activity.toolCalls, 2);
  assert.equal(activity.toolErrors, 1);
  assert.equal(activity.usage?.inputTokens, 100);
  assert.equal(activity.usage?.outputTokens, 50);
});

test("collectTurnTelemetry includes git delta and usage when provided", async () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "top-git-test-"));
  execSync("git init -q && git config user.email t@t.t && git config user.name t", { cwd: tmpRepo });
  fs.writeFileSync(path.join(tmpRepo, "a.txt"), "one\ntwo\nthree\n");
  execSync("git add -A && git commit -qm init", { cwd: tmpRepo });
  fs.appendFileSync(path.join(tmpRepo, "a.txt"), "four\nfive\n");
  const telemetry = await collectTurnTelemetry(
    "turn-dense-1",
    "agent-test",
    { kind: "completed" },
    500,
    {
      cwd: tmpRepo,
      provider: "test-provider",
      title: "Test",
      timeline: [{ type: "tool_call", name: "x", status: "success" }],
      gitBefore: { insertions: 0, deletions: 0, filesChanged: 0 },
    },
  );
  fs.rmSync(tmpRepo, { recursive: true, force: true });
  const validated = topTimelineTelemetrySchema.parse(telemetry);
  assert.equal(validated.toolCalls, 1);
  assert.equal(validated.agentProvider, "test-provider");
  assert.equal(validated.gitInsertions, 2);
  assert.equal(validated.gitFilesChanged, 1);
  assert.equal(validated.inputTokens, undefined);
});
