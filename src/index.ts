import type { Plugin } from "@opencode-ai/plugin"
import { SoulManager } from "./soul-manager.js"

const soulManager = new SoulManager()

const plugin: Plugin = async (_pluginInput, _options) => {
  await soulManager.initialize()

  return {
    "experimental.chat.system.transform":
      soulManager.onSystemTransform.bind(soulManager),
    "experimental.session.compacting":
      soulManager.onCompacting.bind(soulManager),
    tool: soulManager.getTools(),
  }
}

export default plugin
