import type { PluginContext } from "@getpaseo/plugin";
import {
  getSystemResourcesRpc,
  topSettingsContract,
  getCustomPillsRpc,
  runCustomPillModalCommandRpc,
} from "./resources.shared";
import {
  handleGetSystemResources,
  handleGetSettings,
  handleUpdateSettings,
  handleResetSettings,
  handleGetCustomPills,
  handleRunCustomPillModalCommand,
  customPillPoller,
} from "./resources.server";
import { contributeClient } from "./pill.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(topSettingsContract.get, handleGetSettings);
  plugin.handle(topSettingsContract.update, handleUpdateSettings);
  plugin.handle(topSettingsContract.reset, handleResetSettings);
  plugin.handle(getSystemResourcesRpc, handleGetSystemResources);
  plugin.handle(getCustomPillsRpc, handleGetCustomPills);
  plugin.handle(runCustomPillModalCommandRpc, handleRunCustomPillModalCommand);
  plugin.addClientSide(contributeClient);
  return () => {
    customPillPoller.stop();
  };
}
