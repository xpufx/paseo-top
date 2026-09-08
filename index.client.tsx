import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { initClientHelpers } from "paseo-plugin-helper/client";
import { contributeClient } from "./client/pill";
import { TopTimelineTelemetryCard } from "./client/telemetry";
import {
  TOP_TIMELINE_KIND,
  TOP_TIMELINE_VERSION,
  topTimelineTelemetrySchema,
} from "./shared/resources";

initClientHelpers({ Icon, Modal, useRpc, useToast });

export default function contribute(client: PluginClientContext) {
  const removeTimelineRenderer = client.addTimelineRenderer({
    kind: TOP_TIMELINE_KIND,
    version: TOP_TIMELINE_VERSION,
    schema: topTimelineTelemetrySchema,
    Component: TopTimelineTelemetryCard,
  });

  const cleanupClient = contributeClient(client);

  return () => {
    removeTimelineRenderer();
    cleanupClient();
  };
}
