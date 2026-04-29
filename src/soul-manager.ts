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
    const sessionID = input.sessionID || "unknown"
    const manager = this.getScratchpadManager(sessionID)
    
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
      "### 客观知识层（Memory.md）",
      "长期知识存储在 `~/.opencode/soul/memory/`。",
      "直接读写文件即可。链接格式由你自行约定。",
      "",
      "### 理解层（Scratchpad）",
      `当前 session 的 scratchpad: ${scratchpadPath}`,
      "使用 `scratch_write` 记录你对 Memory.md 的阅读理解。",
      "**关键：不要复制原文，写下\"这次阅读对你当前任务的意义\"**.",
      "",
      "### 归档",
      "不需要专用工具，直接读写 `~/.opencode/soul/memory/` 即可。",
      "Session 结束前，特别是收到 compact 提醒时，请把有价值的理解写入 Memory.md。",
    ].join("\n")

    if (Array.isArray(output.system)) {
      output.system.push(injection)
    } else {
      output.system = output.system
        ? `${output.system}\n\n${injection}`
        : injection
    }
  }

  async onCompacting(input: any, output: any): Promise<void> {
    const sessionID = input.sessionID || "unknown"
    const scratchpadPath = this.getScratchpadManager(sessionID).path
    const isUserTriggered = !input.auto

    let compactWarning: string

    if (isUserTriggered) {
      compactWarning = [
        "---",
        "⚠️ Context Compaction: USER TRIGGERED",
        "---",
        "用户主动要求压缩上下文（`/compact`），这意味着他们想要一个干净的新起点。",
        `你的当前 scratchpad: ${scratchpadPath}`,
        "",
        "**请立即回顾你的 scratchpad，把所有有价值的理解写入 Memory.md。**",
        "因为用户明确想要结束当前对话，这次 session 的心境和理解如果不归档，将永远丢失。",
        "",
        "归档检查清单：",
        "1. 【关键决策】→ 写入对应项目的 decisions.md",
        "2. 【新洞察】→ 写入对应主题的 memory 文件",
        "3. 【用户偏好】→ 更新 memory/meta/user-preferences.md",
        "4. 【项目状态】→ 更新对应项目的 SUMMARY.md",
        "",
        "不需要专用工具，直接读写 `~/.opencode/soul/memory/` 下的文件即可。",
        "如果不确定某个内容是否值得归档，**保守起见先归档**。",
      ].join("\n")
    } else {
      compactWarning = [
        "---",
        "Context Compaction Warning",
        "---",
        "你的对话上下文即将被自动压缩/摘要化。",
        `你的当前 scratchpad: ${scratchpadPath}`,
        "",
        "压缩后，详细的对话历史将丢失，只保留结构化摘要。",
        "时间宝贵，请**快速追加 1-2 条最重要的理解到 Scratchpad**（不要归档到 Memory.md）。",
        "等到 session 真正结束时，再把累积的理解选择性归档。",
      ].join("\n")
    }

    output.context = output.context || []
    output.context.push(compactWarning)
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
          const sessionID = context.sessionID || "unknown"
          const manager = this.getScratchpadManager(sessionID)
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
          const sessionID = context.sessionID || "unknown"
          const manager = this.getScratchpadManager(sessionID)
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
          const sessionID = context.sessionID || "unknown"
          const manager = this.getScratchpadManager(sessionID)
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
          const sessionID = context.sessionID || "unknown"
          const manager = this.getScratchpadManager(sessionID)
          await manager.deleteSection(args.section)
          return `已删除 section: ${args.section}`
        },
      }),

      scratch_clear: tool({
        description: "清空当前 scratchpad（谨慎使用）",
        args: {},
        execute: async (_args: any, context: any) => {
          const sessionID = context.sessionID || "unknown"
          const manager = this.getScratchpadManager(sessionID)
          await manager.clear()
          return "已清空 scratchpad"
        },
      }),
    }
  }
}
