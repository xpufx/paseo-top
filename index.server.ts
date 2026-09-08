import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  getSystemResourcesRpc,
  getCustomPillsRpc,
  listCustomPillsRpc,
  runCustomPillModalCommandRpc,
  topSettingsContract,
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
} from "./server/resources";

export default function contribute(server: PluginServerContext) {
  server.handle(topSettingsContract.get, handleGetSettings);
  server.handle(topSettingsContract.update, handleUpdateSettings);
  server.handle(topSettingsContract.reset, handleResetSettings);
  server.handle(getSystemResourcesRpc, handleGetSystemResources);
  server.handle(getCustomPillsRpc, handleGetCustomPills);
  server.handle(listCustomPillsRpc, handleListCustomPills);
  server.handle(runCustomPillModalCommandRpc, handleRunCustomPillModalCommand);

  return () => {
    customPillPoller.stop();
  };
}
