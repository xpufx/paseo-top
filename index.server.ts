import type { PluginServerContext } from "@getpaseo/plugin";
import { getSystemResourcesRpc } from "./shared/resources";
import { handleGetSystemResources } from "./server/resources";

export default function contribute(server: PluginServerContext) {
  server.handle(getSystemResourcesRpc, handleGetSystemResources);
  return () => {};
}
