import { getScratchpadPath, readFileSafe, writeFileSafe } from "./utils.js"

export interface Slot {
  title: string
  type?: string
  source?: string
  content: string
  raw: string
}

const INVALID_FIELD = /[\r\n]/

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

    if (filter.source) {
      if (!slot.source?.includes(filter.source)) return false
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
    const title = normalizeSectionTitle(section)
    validateInlineField("Section title", title)
    if (type) validateInlineField("Section type", type)
    if (source) validateInlineField("Section source", source)

    const existing = await this.read()

    const metadata: string[] = []
    if (type) metadata.push(`> type: ${type}`)
    if (source) metadata.push(`> source: ${source}`)

    const entry = [
      `## ${title}`,
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

    const query = normalizeSectionTitle(section)

    const slots = parseScratchpad(content)
    const matches = slots.filter((s) =>
      s.title.toLowerCase().includes(query.toLowerCase())
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
    const query = normalizeSectionTitle(section)
    const content = await this.read()
    const slots = parseScratchpad(content)
    const remaining = slots.filter(
      (s) => !s.title.toLowerCase().includes(query.toLowerCase())
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

function normalizeSectionTitle(section: string): string {
  const title = (section ?? "").trim()
  if (!title) throw new Error("Section title cannot be empty")
  return title
}

function validateInlineField(name: string, value: string): void {
  if (INVALID_FIELD.test(value)) {
    throw new Error(`${name} cannot contain newlines`)
  }
}
