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

    const basePrompt = [
      "---",
      isUserTriggered ? "⚠️ PRE-COMPACT: USER TRIGGERED" : "⚠️ PRE-COMPACT: AUTO",
      "---",
      "上下文即将压缩。详细对话历史将丢失。",
      `当前 scratchpad: ${scratchpadPath}`,
      "",
      "【唯一归档时机】压缩后无法补救。立即分流：",
      "- 热数据（活跃思路、待办、未完成假设）→ scratch_write 追加到 scratchpad",
      "- 冷数据（已验证决策、项目知识、用户偏好）→ 直接 write/edit 到 memory/",
      "",
      "原理：Scratchpad 保留主观理解（认知备份），Memory 沉淀客观知识。",
      "compact 后对话丢失，但 scratchpad 和 memory 文件保留，确保认知延续。",
      "",
      isUserTriggered
        ? "用户主动要求 clean start → 完整归档，不要遗漏任何理解。"
        : "自动触发 → 优先保留热数据，限制 1-2 个 tool call。",
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
          "上下文已压缩。详细对话丢失，只剩摘要。",
          `你的 scratchpad: ${scratchpadPath}`,
          "",
          "【立即】读取 scratchpad 找回认知：",
          "→ scratch_read 最近的 slot",
          "→ 确认 pre-compact 归档是否完成",
          "→ 带着理解继续工作",
          "",
          "不要基于摘要硬撑——找回你之前的思路和待办。",
        ].join("\n")
      : [
          "---",
          "⚠️ COMPACT COMPLETED (Auto)",
          "---",
          "上下文已自动压缩。详细对话丢失。",
          `你的 scratchpad: ${scratchpadPath}`,
          "",
          "【建议】快速读取找回思路：",
          "→ scratch_read 最近的待办和理解",
          "→ 确认进度后继续工作",
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
                  s.source ? ` (source: ${s.source})` : ""
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
          await manager.deleteSection(args.section)
          return `已删除 section: ${args.section}`
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
