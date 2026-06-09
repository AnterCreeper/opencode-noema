import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { fileURLToPath } from "node:url"

const HOME_DIR = process.env.NOEMA_HOME || os.homedir()
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

export const SOUL_DIR = path.join(HOME_DIR, ".opencode", "soul")
export const SOUL_FILE = path.join(SOUL_DIR, "SOUL.md")
export const MEMORY_DIR = path.join(SOUL_DIR, "memory")
export const SCRATCHPAD_DIR = path.join(HOME_DIR, ".opencode", ".scratchpad")
export const PROJECT_SOUL_TEMPLATE_FILE = path.resolve(MODULE_DIR, "..", "soul", "SOUL.md")
export const PROJECT_MEMORY_TEMPLATE_DIR = path.resolve(MODULE_DIR, "..", "soul", "memory")
export const PROJECT_MEMORY_README_TEMPLATE_FILE = path.join(PROJECT_MEMORY_TEMPLATE_DIR, "README.md")
export const PROJECT_MEMORY_INDEX_TEMPLATE_FILE = path.join(PROJECT_MEMORY_TEMPLATE_DIR, "index.md")

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function readFileSafe(filePath: string, defaultContent: string = ""): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultContent
    }
    throw error
  }
}

export async function writeFileSafe(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, "utf-8")
}

export async function readBundledSoulTemplate(): Promise<string> {
  return fs.readFile(PROJECT_SOUL_TEMPLATE_FILE, "utf-8")
}

export async function readBundledMemoryReadmeTemplate(): Promise<string> {
  return fs.readFile(PROJECT_MEMORY_README_TEMPLATE_FILE, "utf-8")
}

export async function readBundledMemoryIndexTemplate(): Promise<string> {
  return fs.readFile(PROJECT_MEMORY_INDEX_TEMPLATE_FILE, "utf-8")
}

export function sanitizeSessionID(sessionID: string): string {
  const sanitized = sessionID.replace(/[^a-zA-Z0-9_-]/g, "_")
  return sanitized || "unknown"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

export function getScratchpadPath(sessionID: string): string {
  return path.join(SCRATCHPAD_DIR, `${sanitizeSessionID(sessionID)}.md`)
}
