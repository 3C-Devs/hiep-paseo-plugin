import { getPaseoClient, type PluginClientContext } from "@getpaseo/plugin/client";
import { createSidebarController } from "./client/sidebar-state";
import { installSidebar } from "./client/web";
export default function contribute(client: PluginClientContext) {
  return installSidebar(createSidebarController(client, getPaseoClient));
}
