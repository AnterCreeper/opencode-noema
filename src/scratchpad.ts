import * as fs from "node:fs/promises"
import { getScratchpadPath, readFileSafe, writeFileSafe } from "./utils.js"

export interface Slot {
  title: string
  type?: string
  source?: string
  content: string
  raw: string
}

export function parseScratchpad(content: string): Slot[] {
  const slots: Slot[] = []
  const sections = content.split(/^## /m)

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    if (!section.trim()) continue

    const lines = section.split("\n")
    const title = lines[0].trim()

    // Skip the header section (e.g., "# Scratchpad: session-id")
    if (i === 0 && title.startsWith("# ")) continue

    const typeMatch = section.match(/^>\s*type:\s*(\w+)/m)
    const sourceMatch = section.match(/^>\s*source:\s*(.+)/m)

    slots.push({
      title,
      type: typeMatch?.[1]?.toLowerCase(),
      source: sourceMatch?.[1]?.trim(),
      content: section.replace(/^>\s*(type|source):.*\n?/gm, "").trim(),
      raw: "## " + section,
    })
  }

  return slots
}

export function fuzzyFindSlots(
  slots: Slot[],
  filter: { type?: string; source?: string; keyword?: string }
): Slot[] {
  return slots.filter((slot) => {
    if (filter.type) {
      const typeMatch =
        slot.type === filter.type || slot.title.includes(filter.type)
      if (!typeMatch) return false
    }

    if (filter.source && slot.source) {
      if (!slot.source.includes(filter.source)) return false
    }

    if (filter.keyword) {
      const text = (slot.title + " " + slot.content).toLowerCase()
      if (!text.includes(filter.keyword.toLowerCase())) return false
    }

    return true
  })
}

export class ScratchpadManager {
  private sessionID: string

  constructor(sessionID: string) {
    this.sessionID = sessionID
  }

  get id(): string {
    return this.sessionID
  }

  get path(): string {
    return getScratchpadPath(this.sessionID)
  }

  async read(): Promise<string> {
    return readFileSafe(this.path, `# Scratchpad: ${this.sessionID}\n\n`)
  }

  async writeSection(
    section: string,
    content: string,
    type?: string,
    source?: string
  ): Promise<void> {
    if (!section.trim()) {
      throw new Error("Section title cannot be empty")
    }

    const existing = await this.read()

    const metadata: string[] = []
    if (type) metadata.push(`> type: ${type}`)
    if (source) metadata.push(`> source: ${source}`)

    const entry = [
      `## ${section}`,
      ...metadata,
      "",
      content,
      "",
    ].join("\n")

    const updated = existing + entry
    await writeFileSafe(this.path, updated)
  }

  async readSection(section: string): Promise<string> {
    const content = await this.read()
    if (section === "*") {
      const slots = parseScratchpad(content)
      return slots.map((s) => s.raw).join("\n")
    }

    const slots = parseScratchpad(content)
    const matches = slots.filter((s) =>
      s.title.toLowerCase().includes(section.toLowerCase())
    )

    if (matches.length === 0) return ""
    if (matches.length === 1) return matches[0].raw

    // 多匹配时分隔显示
    return matches.map((m) => m.raw).join("\n\n---\n\n")
  }

  async list(filter?: {
    type?: string
    source?: string
    keyword?: string
  }): Promise<Slot[]> {
    const content = await this.read()
    const slots = parseScratchpad(content)

    if (!filter) return slots
    return fuzzyFindSlots(slots, filter)
  }

  async deleteSection(section: string): Promise<void> {
    const content = await this.read()
    const slots = parseScratchpad(content)
    const remaining = slots.filter(
      (s) => !s.title.toLowerCase().includes(section.toLowerCase())
    )

    if (remaining.length === 0) {
      await this.clear()
      return
    }

    const header = `# Scratchpad: ${this.sessionID}\n\n`
    const updated = header + remaining.map((s) => s.raw).join("\n")
    await writeFileSafe(this.path, updated)
  }

  async clear(): Promise<void> {
    await writeFileSafe(
      this.path,
      `# Scratchpad: ${this.sessionID}\n\n`
    )
  }
}
