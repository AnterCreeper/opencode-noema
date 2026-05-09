import * as path from "node:path"
import * as fs from "node:fs/promises"
import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import { ScratchpadManager, type Slot } from "./scratchpad.js"
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

interface SessionInput {
  sessionID?: string
}

interface SystemTransformOutput {
  system: string[] | string
}

interface PreCompactInput extends SessionInput {
  auto?: boolean
}

interface PreCompactOutput {
  shouldRun: boolean
  prompt?: string
}

interface CompactingOutput {
  context?: string[]
}

interface ScratchWriteArgs {
  section: string
  content: string
  type?: "comprehension" | "todo" | "insight" | "draft" | "note"
  source?: string
}

interface ScratchReadArgs {
  section: string
}

interface ScratchListArgs {
  type?: string
  source?: string
  keyword?: string
}

interface ScratchDeleteArgs {
  section: string
}

export class SoulManager {
  private scratchpadManager?: ScratchpadManager

  async initialize(): Promise<void> {
    await ensureDir(MEMORY_DIR)
    await ensureDir(path.dirname(SOUL_FILE))

    await writeIfMissing(SOUL_FILE, DEFAULT_SOUL_TEMPLATE)
    await writeIfMissing(path.join(MEMORY_DIR, "README.md"), MEMORY_README_TEMPLATE)
    await writeIfMissing(path.join(MEMORY_DIR, "index.md"), MEMORY_INDEX_TEMPLATE)
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

  async onSystemTransform(input: SessionInput, output: SystemTransformOutput): Promise<void> {
    const soulContent = await this.readSoulFile()
    const manager = this.getManagerFromContext(input)

    await writeIfMissing(manager.path, `# Scratchpad: ${manager.id}\n\n`)

    const injection = this.buildSystemInjection(soulContent, manager.path)

    if (Array.isArray(output.system)) {
      output.system.push(injection)
    } else {
      output.system = output.system ? `${output.system}\n\n${injection}` : injection
    }
  }

  private buildSystemInjection(soulContent: string, scratchpadPath: string): string {
    return [
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
  }

  private getManagerFromContext(context: SessionInput): ScratchpadManager {
    const sessionID = context.sessionID || "unknown"
    return this.getScratchpadManager(sessionID)
  }

  private isUserTriggered(input: PreCompactInput): boolean {
    return !input.auto
  }

  async onPreCompact(input: PreCompactInput, output: PreCompactOutput): Promise<void> {
    const manager = this.getManagerFromContext(input)
    const scratchpadPath = manager.path

    output.shouldRun = true
    output.prompt = this.buildPreCompactPrompt(scratchpadPath, this.isUserTriggered(input))
  }

  private buildPreCompactPrompt(scratchpadPath: string, isUserTriggered: boolean): string {
    return isUserTriggered
      ? [
          "---",
          "⚠️ PRE-COMPACT: USER TRIGGERED",
          "---",
          "上下文即将压缩。这是压缩前额外提供的 tool-enabled 归档窗口。",
          `Scratchpad: ${scratchpadPath}`,
          "",
          "请使用 tool 归档（完成后系统才执行 compact）：",
          "- 🔥 热数据（活跃思路、待办）→ scratch_write 追加到 scratchpad",
          "- ❄️ 冷数据（已验证决策、知识）→ write/edit 到 memory/",
          "- 🗑️ 临时草稿、已失效信息 → 丢弃（不执行任何操作）",
          "",
          "完成后如 scratchpad 条目已转存 memory/，可 scratch_delete 清理。",
        ].join("\n")
      : [
          "---",
          "⚠️ PRE-COMPACT: AUTO",
          "---",
          "上下文即将压缩。这是压缩前额外提供的 tool-enabled 归档窗口。",
          `Scratchpad: ${scratchpadPath}`,
          "",
          "请快速归档（1-2 个 tool call，完成后系统才执行 compact）：",
          "P0: 未完成待办 → scratch_write（必须保留）",
          "P1: 已验证决策 → 如时间够，write/edit 到 memory/",
          "P2: 其他理解 → 可丢弃",
          "",
          "原则：热数据保命，冷数据随缘。",
        ].join("\n")
  }

  async onCompacting(input: SessionInput, output: CompactingOutput): Promise<void> {
    const manager = this.getManagerFromContext(input)
    const scratchpadPath = manager.path

    // compacting hook 在 pre-compact 之前触发，output.context 会拼接进 summary prompt
    // summary 生成阶段不能执行 tool，因此只提供位置信息，不命令任何操作
    output.context = output.context || []
    output.context.push(
      `Scratchpad: ${scratchpadPath}`,
      `Memory: ~/.opencode/soul/memory/`,
    )
  }

  getTools(): Record<string, ToolDefinition> {
    return {
      scratch_write: tool({
        description:
          "在 scratchpad 中记录理解、想法或待办事项。默认追加到现有内容。",
        args: {
          section: tool.schema
            .string()
            .min(1)
            .describe("Slot 标题，如'阅读 architecture.md 的理解'"),
          content: tool.schema.string().describe("要记录的内容"),
          type: tool.schema
            .enum(["comprehension", "todo", "insight", "draft", "note"])
            .optional()
            .describe("内容类型（可选）"),
          source: tool.schema
            .string()
            .min(1)
            .optional()
            .describe("关联的 Memory.md 路径（可选）"),
        },
        execute: async (args: ScratchWriteArgs, context: ToolContext) => {
          const manager = this.getManagerFromContext(context)
          await manager.writeSection(args.section, args.content, args.type, args.source)
          return `已写入 scratchpad: ${args.section}`
        },
      }),

      scratch_read: tool({
        description: "读取当前 scratchpad 的全部或指定 section",
        args: {
          section: tool.schema
            .string()
            .min(1)
            .default("*")
            .describe("'*' 表示全部，或指定 section 标题（模糊匹配）"),
        },
        execute: async (args: ScratchReadArgs, context: ToolContext) => {
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
            .min(1)
            .optional()
            .describe("按类型过滤（模糊匹配）"),
          source: tool.schema
            .string()
            .min(1)
            .optional()
            .describe("按来源过滤（模糊匹配）"),
          keyword: tool.schema
            .string()
            .min(1)
            .optional()
            .describe("按关键词全文搜索"),
        },
        execute: async (args: ScratchListArgs, context: ToolContext) => {
          const manager = this.getManagerFromContext(context)
          const slots = await manager.list({
            type: args.type,
            source: args.source,
            keyword: args.keyword,
          })

          if (slots.length === 0) return "未找到匹配的 slots"

          return slots
            .map(
              (s: Slot) =>
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
          section: tool.schema.string().min(1).describe("要删除的 section 标题"),
        },
        execute: async (args: ScratchDeleteArgs, context: ToolContext) => {
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
        execute: async (_args: Record<string, never>, context: ToolContext) => {
          const manager = this.getManagerFromContext(context)
          await manager.clear()
          return "已清空 scratchpad"
        },
      }),
    }
  }
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      await writeFileSafe(filePath, content)
      return
    }
    throw error
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
