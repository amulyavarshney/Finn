import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Content-hash cache for model responses, keyed on provider + model + prompt.
 *
 * Two locations, checked in order:
 *   data/llm-cache  committed to the repo, so a fresh clone and every demo run
 *                   costs nothing and produces identical output
 *   os.tmpdir()     writable at runtime, including on Vercel where the bundle
 *                   directory is read-only
 */

const REPO_DIR = join(process.cwd(), "data", "llm-cache");
const TMP_DIR = join(tmpdir(), "finn-llm-cache");

let repoWritable: boolean | null = null;

function canWriteRepo(): boolean {
  if (repoWritable !== null) return repoWritable;
  try {
    mkdirSync(REPO_DIR, { recursive: true });
    writeFileSync(join(REPO_DIR, ".probe"), "1");
    repoWritable = true;
  } catch {
    repoWritable = false;
  }
  return repoWritable;
}

export function cacheKey(parts: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export function readCache(key: string): string | null {
  for (const dir of [REPO_DIR, TMP_DIR]) {
    const path = join(dir, `${key}.json`);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8")).text as string;
      } catch {
        // Corrupt entry; fall through and treat as a miss.
      }
    }
  }
  return null;
}

export function writeCache(key: string, text: string, meta: Record<string, unknown>): void {
  const dir = canWriteRepo() ? REPO_DIR : TMP_DIR;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ text, ...meta }, null, 2));
  } catch {
    // A cache write failure must never fail the request.
  }
}
