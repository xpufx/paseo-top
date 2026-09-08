import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  topTimelineTelemetrySchema,
  TopSettingsSchema,
  TOP_TIMELINE_KIND,
  TOP_TIMELINE_VERSION,
} from "../shared/resources";
import { collectTurnTelemetry, customPillPoller } from "./resources";

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

test("TopSettingsSchema includes recordTurnTelemetry defaulting to true", () => {
  const defaults = TopSettingsSchema.parse({});
  assert.equal(defaults.recordTurnTelemetry, true);

  const disabled = TopSettingsSchema.parse({ recordTurnTelemetry: false });
  assert.equal(disabled.recordTurnTelemetry, false);
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
