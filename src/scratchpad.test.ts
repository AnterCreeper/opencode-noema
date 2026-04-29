import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import {
  parseScratchpad,
  fuzzyFindSlots,
  ScratchpadManager,
} from "../src/scratchpad.js"

describe("Scratchpad", () => {
  const testDir = path.join(os.tmpdir(), "noema-test-" + Date.now())
  const testFile = path.join(testDir, "test.md")

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe("parseScratchpad", () => {
    it("should parse simple scratchpad", () => {
      const content = `# Scratchpad: test

## 阅读文档
> type: comprehension
> source: memory/test.md

- 这是理解内容

## 待办
> type: todo

- [ ] 任务1
`
      const slots = parseScratchpad(content)
      expect(slots).toHaveLength(2)
      expect(slots[0].title).toBe("阅读文档")
      expect(slots[0].type).toBe("comprehension")
      expect(slots[0].source).toBe("memory/test.md")
      expect(slots[1].title).toBe("待办")
      expect(slots[1].type).toBe("todo")
    })

    it("should handle slots without metadata", () => {
      const content = `# Scratchpad: test

## 想法

- 一些想法
`
      const slots = parseScratchpad(content)
      expect(slots).toHaveLength(1)
      expect(slots[0].title).toBe("想法")
      expect(slots[0].type).toBeUndefined()
    })
  })

  describe("fuzzyFindSlots", () => {
    it("should filter by type", () => {
      const slots = [
        { title: "阅读", type: "comprehension", content: "", raw: "" },
        { title: "待办", type: "todo", content: "", raw: "" },
      ]
      const result = fuzzyFindSlots(slots, { type: "todo" })
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("待办")
    })

    it("should filter by keyword", () => {
      const slots = [
        { title: "架构设计", type: "comprehension", content: "使用微服务", raw: "" },
        { title: "前端优化", type: "insight", content: "减少渲染", raw: "" },
      ]
      const result = fuzzyFindSlots(slots, { keyword: "微服务" })
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("架构设计")
    })
  })

  describe("ScratchpadManager", () => {
    it("should write and read sections", async () => {
      const manager = new ScratchpadManager("test-session")
      // Override path for testing
      Object.defineProperty(manager, "path", {
        value: testFile,
        writable: true,
        configurable: true,
      })

      await manager.writeSection("测试", "这是内容", "note")
      const content = await manager.read()
      expect(content).toContain("## 测试")
      expect(content).toContain("这是内容")
      expect(content).toContain("> type: note")
    })

    it("should list slots", async () => {
      const manager = new ScratchpadManager("test-session")
      Object.defineProperty(manager, "path", {
        value: testFile,
        writable: true,
        configurable: true,
      })

      await manager.writeSection("想法1", "内容1", "insight")
      await manager.writeSection("想法2", "内容2", "insight")
      await manager.writeSection("待办", "任务", "todo")

      const slots = await manager.list({ type: "insight" })
      expect(slots).toHaveLength(2)
    })
  })
})
