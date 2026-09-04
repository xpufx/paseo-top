import type { PluginContext } from "@getpaseo/plugin";
import { getSystemResourcesRpc } from "./resources.shared";
import { handleGetSystemResources } from "./resources.server";
import { contributeClient } from "./pill.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(getSystemResourcesRpc, handleGetSystemResources);
  plugin.addClientSide(contributeClient);
  return () => {};
}
