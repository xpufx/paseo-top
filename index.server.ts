import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  getSystemResourcesRpc,
  getCustomPillsRpc,
  listCustomPillsRpc,
  runCustomPillModalCommandRpc,
  topSettingsContract,
  TOP_TIMELINE_KIND,
  TOP_TIMELINE_VERSION,
} from "./shared/resources";
import {
  handleGetSystemResources,
  handleGetCustomPills,
  handleListCustomPills,
  handleRunCustomPillModalCommand,
  handleGetSettings,
  handleUpdateSettings,
  handleResetSettings,
  customPillPoller,
  collectTurnTelemetry,
  collectGitDiffStat,
  log,
} from "./server/resources";

export default function contribute(server: PluginServerContext) {
  void customPillPoller.start();

  server.handle(topSettingsContract.get, handleGetSettings);
  server.handle(topSettingsContract.update, handleUpdateSettings);
  server.handle(topSettingsContract.reset, handleResetSettings);
  server.handle(getSystemResourcesRpc, handleGetSystemResources);
  server.handle(getCustomPillsRpc, handleGetCustomPills);
  server.handle(listCustomPillsRpc, handleListCustomPills);
  server.handle(runCustomPillModalCommandRpc, handleRunCustomPillModalCommand);

  const turnStartTimes = new Map<string, number>();
  const turnGitBefore = new Map<string, { insertions: number; deletions: number; filesChanged: number }>();

  const unsubscribeTurnStarted = server.on("agent.turn_started", (event) => {
    turnStartTimes.set(event.agent.id, Date.now());
    const before = collectGitDiffStat(event.agent.cwd);
    if (before) {
      turnGitBefore.set(event.agent.id, before);
    } else {
      turnGitBefore.delete(event.agent.id);
    }
  });

  const unsubscribeTurnEnded = server.on("agent.turn_ended", async (event, context) => {
    try {
      const settings = await handleGetSettings();
      if (settings.recordTurnTelemetry === false) {
        turnStartTimes.delete(event.agent.id);
        turnGitBefore.delete(event.agent.id);
        return;
      }

      const startTime = turnStartTimes.get(event.agent.id);
      turnStartTimes.delete(event.agent.id);
      const gitBefore = turnGitBefore.get(event.agent.id);
      turnGitBefore.delete(event.agent.id);
      const durationMs = startTime ? Date.now() - startTime : undefined;

      const telemetry = await collectTurnTelemetry(
        event.turnId,
        event.agent.id,
        event.outcome,
        durationMs,
        {
          cwd: event.agent.cwd,
          provider: event.agent.provider,
          title: event.agent.title,
          timeline: event.timeline,
          gitBefore: gitBefore ?? null,
        },
      );

      await context.paseo.agents.ref(event.agent.id).timeline.append({
        type: "plugin",
        id: `top-turn-${event.turnId ?? Date.now()}`,
        kind: TOP_TIMELINE_KIND,
        version: TOP_TIMELINE_VERSION,
        data: telemetry,
      });

      log.info("Appended turn telemetry to timeline", {
        agentId: event.agent.id,
        turnId: event.turnId,
        outcome: event.outcome.kind,
        durationMs,
        cpuPercent: telemetry.cpuPercent,
        memPercent: telemetry.memPercent,
      });
    } catch (err) {
      log.warn("Failed to record turn telemetry", {
        agentId: event.agent.id,
        turnId: event.turnId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return () => {
    customPillPoller.stop();
    unsubscribeTurnStarted();
    unsubscribeTurnEnded();
  };
}
