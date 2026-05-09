import * as path from "node:path"
import * as fs from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { ScratchpadManager } from "./scratchpad.js"
import {
  SOUL_FILE,
  MEMORY_DIR,
  DEFAULT_SOUL_TEMPLATE,
  MEMORY_README_TEMPLATE,
  MEMORY_INDEX_TEMPLATE,
  readFileSafe,
  writeFileSafe,
  ensureDir,
} from "./utils.js"

export class SoulManager {
  private scratchpadManager?: ScratchpadManager

  async initialize(): Promise<void> {
    await ensureDir(MEMORY_DIR)
    await ensureDir(SOUL_FILE.replace("/SOUL.md", ""))

    // 创建 SOUL.md（如果不存在）
    const soulExists = await readFileSafe(SOUL_FILE)
    if (!soulExists) {
      await writeFileSafe(SOUL_FILE, DEFAULT_SOUL_TEMPLATE)
    }

    // 创建 memory/README.md（如果不存在）
    const readmePath = path.join(MEMORY_DIR, "README.md")
    const readmeExists = await readFileSafe(readmePath)
    if (!readmeExists) {
      await writeFileSafe(readmePath, MEMORY_README_TEMPLATE)
    }

    // 创建 memory/index.md（如果不存在）
    const indexPath = path.join(MEMORY_DIR, "index.md")
    const indexExists = await readFileSafe(indexPath)
    if (!indexExists) {
      await writeFileSafe(indexPath, MEMORY_INDEX_TEMPLATE)
    }
  }

  getScratchpadManager(sessionID: string): ScratchpadManager {
    if (!this.scratchpadManager || this.scratchpadManager.id !== sessionID) {
      this.scratchpadManager = new ScratchpadManager(sessionID)
    }
    return this.scratchpadManager
  }

  async readSoulFile(): Promise<string> {
    return readFileSafe(SOUL_FILE, DEFAULT_SOUL_TEMPLATE)
  }

  async onSystemTransform(input: any, output: any): Promise<void> {
    const soulContent = await this.readSoulFile()
    const manager = this.getManagerFromContext(input)

    // 预先创建 scratchpad 文件（如果不存在），避免 AI 首次读取时遇到 "no such file"
    // 注意：不要每次调用都 clear，只在文件不存在时创建初始模板
    try {
      await fs.access(manager.path)
    } catch {
      await manager.clear()
    }
    
    const scratchpadPath = manager.path

    const injection = [
      soulContent,
      "",
      "## Memory System",
      "",
      `Scratchpad: ${scratchpadPath}`,
      "Memory: ~/.opencode/soul/memory/",
      "",
      "使用 scratch_* 工具写理解，直接读写文件归档。",
      "不要复制原文，写'这次阅读对我当前任务的意义'。",
    ].join("\n")

    if (Array.isArray(output.system)) {
      output.system.push(injection)
    } else {
      output.system = output.system
        ? `${output.system}\n\n${injection}`
        : injection
    }
  }

  private getManagerFromContext(context: any): ScratchpadManager {
    const sessionID = context.sessionID || "unknown"
    return this.getScratchpadManager(sessionID)
  }

  private getSessionInfo(input: any): { sessionID: string; scratchpadPath: string; isUserTriggered: boolean } {
    const sessionID = input.sessionID || "unknown"
    const scratchpadPath = this.getScratchpadManager(sessionID).path
    const isUserTriggered = !input.auto
    return { sessionID, scratchpadPath, isUserTriggered }
  }

  async onPreCompact(input: any, output: any): Promise<void> {
    const { scratchpadPath, isUserTriggered } = this.getSessionInfo(input)

    output.shouldRun = true

    const basePrompt = isUserTriggered
      ? [
          "---",
          "⚠️ PRE-COMPACT: USER TRIGGERED",
          "---",
          "上下文即将压缩。用户要求 clean start。",
          `Scratchpad: ${scratchpadPath}`,
          "",
          "【完整归档】系统允许完整 tool call。请完整分流：",
          "- 🔥 热数据（活跃思路、待办、未完成假设）→ scratch_write 追加到 scratchpad",
          "- ❄️ 冷数据（已验证决策、项目知识、用户偏好、技术洞察）→ write/edit 到 memory/",
          "- 🗑️ 临时草稿、已失效信息 → 丢弃（不执行任何操作）",
          "",
          "完成后如 scratchpad 条目已转存 memory/，可 scratch_delete 清理。",
          "不要遗漏——这是你唯一一次完整归档的机会。",
        ].join("\n")
      : [
          "---",
          "⚠️ PRE-COMPACT: AUTO",
          "---",
          "上下文即将压缩。详细对话历史将丢失。",
          `Scratchpad: ${scratchpadPath}`,
          "",
          "【紧急抢救】只有 1-2 个 tool call。不要贪心：",
          "",
          "优先级（只做最高优先级的 1-2 项）：",
          "P0: 未完成待办或关键假设 → scratch_write（必须保留）",
          "P1: 已验证的重要决策/知识 → 如时间够，write/edit 到 memory/",
          "P2: 其他理解 → 可丢弃（遗忘是 feature，不是 bug）",
          "",
          "原则：热数据保命，冷数据随缘。",
        ].join("\n")

    output.prompt = basePrompt
  }

  async onCompacting(input: any, output: any): Promise<void> {
    const { scratchpadPath, isUserTriggered } = this.getSessionInfo(input)

    const recoveryPrompt = isUserTriggered
      ? [
          "---",
          "⚠️ COMPACT COMPLETED (User Triggered)",
          "---",
          "用户主动要求 clean start，上下文已压缩。",
          `你的 scratchpad: ${scratchpadPath}`,
          "",
          "【必须执行】你在 pre-compact 阶段做了完整归档投资。现在需要：",
          "1. scratch_read 读取最近的 slot，验证归档是否完整",
          "2. 确认 memory/ 中的冷数据是否已成功写入",
          "3. 带着完整理解继续工作——不要基于摘要硬撑",
          "",
          "用户花了精力做 clean start，如果你不按归档继续，这次 compact 就白做了。",
        ].join("\n")
      : [
          "---",
          "⚠️ COMPACT COMPLETED (Auto)",
          "---",
          "上下文已自动压缩。详细对话丢失。",
          `你的 scratchpad: ${scratchpadPath}`,
          "",
          "【按需执行】你在 pre-compact 阶段只抢救了热数据。现在：",
          "- 如果当前任务依赖之前理解 → scratch_read 最近的待办/假设",
          "- 如果当前任务可以独立继续 → 基于摘要直接工作，不要浪费时间",
          "",
          "自动 compact 是系统被迫压缩，不要过度找回——确认关键信息即可。",
        ].join("\n")

    output.context = output.context || []
    output.context.push(recoveryPrompt)
  }

  getTools(): Record<string, any> {
    return {
      scratch_write: tool({
        description:
          "在 scratchpad 中记录理解、想法或待办事项。默认追加到现有内容。",
        args: {
          section: tool.schema
            .string()
            .describe("Slot 标题，如'阅读 architecture.md 的理解'"),
          content: tool.schema.string().describe("要记录的内容"),
          type: tool.schema
            .enum(["comprehension", "todo", "insight", "draft", "note"])
            .optional()
            .describe("内容类型（可选）"),
          source: tool.schema
            .string()
            .optional()
            .describe("关联的 Memory.md 路径（可选）"),
        },
        execute: async (args: any, context: any) => {
          const manager = this.getManagerFromContext(context)
          await manager.writeSection(
            args.section,
            args.content,
            args.type,
            args.source
          )
          return `已写入 scratchpad: ${args.section}`
        },
      }),

      scratch_read: tool({
        description: "读取当前 scratchpad 的全部或指定 section",
        args: {
          section: tool.schema
            .string()
            .default("*")
            .describe("'*' 表示全部，或指定 section 标题（模糊匹配）"),
        },
        execute: async (args: any, context: any) => {
          const manager = this.getManagerFromContext(context)
          const content = await manager.readSection(args.section)
          return content || "未找到匹配的内容"
        },
      }),

      scratch_list: tool({
        description: "列出当前 scratchpad 的所有 slots，支持过滤",
        args: {
          type: tool.schema
            .string()
            .optional()
            .describe("按类型过滤（模糊匹配）"),
          source: tool.schema
            .string()
            .optional()
            .describe("按来源过滤（模糊匹配）"),
          keyword: tool.schema
            .string()
            .optional()
            .describe("按关键词全文搜索"),
        },
        execute: async (args: any, context: any) => {
          const manager = this.getManagerFromContext(context)
          const slots = await manager.list({
            type: args.type,
            source: args.source,
            keyword: args.keyword,
          })

          if (slots.length === 0) return "未找到匹配的 slots"

          return slots
            .map(
              (s: any) =>
                `- [${s.type || "note"}] ${s.title}${
                  s.source ? ` (source: ${s.source})` : " [no source]"
                }`
            )
            .join("\n")
        },
      }),

      scratch_delete: tool({
        description: "删除 scratchpad 中指定的 section（模糊匹配）",
        args: {
          section: tool.schema.string().describe("要删除的 section 标题"),
        },
        execute: async (args: any, context: any) => {
          const manager = this.getManagerFromContext(context)

          const beforeSlots = await manager.list()
          const beforeCount = beforeSlots.length

          await manager.deleteSection(args.section)

          const afterSlots = await manager.list()
          const afterCount = afterSlots.length
          const deletedCount = beforeCount - afterCount

          return `已删除 ${deletedCount} 个 section（匹配"${args.section}"），剩余 ${afterCount} 个`
        },
      }),

      scratch_clear: tool({
        description: "清空当前 scratchpad（谨慎使用）",
        args: {},
        execute: async (_args: any, context: any) => {
          const manager = this.getManagerFromContext(context)
          await manager.clear()
          return "已清空 scratchpad"
        },
      }),
    }
  }
}
