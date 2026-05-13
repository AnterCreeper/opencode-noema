import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

describe("SoulManager", () => {
  const originalNoemaHome = process.env.NOEMA_HOME
  let home: string

  beforeEach(async () => {
    home = path.join(os.tmpdir(), "noema-soul-test-" + Date.now() + Math.random())
    process.env.NOEMA_HOME = home
    vi.resetModules()
    await fs.mkdir(home, { recursive: true })
  })

  afterEach(async () => {
    if (originalNoemaHome === undefined) {
      delete process.env.NOEMA_HOME
    } else {
      process.env.NOEMA_HOME = originalNoemaHome
    }
    vi.resetModules()
    await fs.rm(home, { recursive: true, force: true })
  })

  it("should initialize soul and memory files", async () => {
    const { SoulManager } = await import("./soul-manager.js")
    const manager = new SoulManager()

    await manager.initialize()

    await expect(fs.access(path.join(home, ".opencode", "soul", "SOUL.md"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(home, ".opencode", "soul", "memory", "README.md"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(home, ".opencode", "soul", "memory", "index.md"))).resolves.toBeUndefined()
  })

  it("should inject memory system and create session scratchpad", async () => {
    const { SoulManager } = await import("./soul-manager.js")
    const manager = new SoulManager()
    const output = { system: ["base"] }

    await manager.initialize()
    await manager.onSystemTransform({ sessionID: "session/one" }, output)

    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain("## Memory System")
    expect(output.system[1]).toContain("session_one.md")
    await expect(fs.access(path.join(home, ".opencode", ".scratchpad", "session_one.md"))).resolves.toBeUndefined()
  })

  it("should configure pre-compact prompt with tool-enabled archiving", async () => {
    const { SoulManager } = await import("./soul-manager.js")
    const manager = new SoulManager()
    const output: { shouldRun?: boolean; prompt?: string } = {}

    await manager.onPreCompact({ sessionID: "session-1", auto: false }, output)

    expect(output.shouldRun).toBe(true)
    expect(output.prompt).toContain("PRE-COMPACT: USER TRIGGERED")
    expect(output.prompt).toContain("scratch_write")
    expect(output.prompt).toContain("session-1.md")
  })

  it("should add scratchpad and memory context while compacting", async () => {
    const { SoulManager } = await import("./soul-manager.js")
    const manager = new SoulManager()
    const output: { context: string[] } = { context: [] }

    await manager.onCompacting({ sessionID: "session-1" }, output)

    expect(output.context.join("\n")).toContain("session-1.md")
    expect(output.context.join("\n")).toContain("~/.opencode/soul/memory/")
  })

  it("should read all scratchpad content when scratch_read args omit section", async () => {
    const { SoulManager } = await import("./soul-manager.js")
    const manager = new SoulManager()
    const tools = manager.getTools()
    const context = { sessionID: "session-1" } as any

    await manager.initialize()
    await tools.scratch_write.execute(
      { section: "测试", content: "内容", type: "note" },
      context
    )

    const result = await tools.scratch_read.execute({}, context)

    expect(result).toContain("## 测试")
    expect(result).toContain("内容")
  })
})
