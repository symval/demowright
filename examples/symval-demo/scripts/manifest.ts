/**
 * Manifest writer for symval-demo leaves.
 *
 * Each leaf appends an entry as it finishes rendering. The graph viewer at
 * tmp/graph/index.html reads manifest.json + userflow-graph.json to build
 * the d3 graph.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Move the demowright-emitted SRT aside so the context-close finalizer skips
 * `-vf subtitles=...` burn-in (this Homebrew ffmpeg 8.1.1 is built without
 * libass, so the filter fails the whole render).
 *
 * Returns the new path (still parseable SRT) for the manifest. The mp4
 * itself renders without burnt-in subtitles; the d3 viewer reads the SRT
 * separately and overlays captions.
 */
export function detachSrtForViewer(srtPath: string | undefined): string | undefined {
  if (!srtPath || !existsSync(srtPath)) return undefined;
  const sidecar = srtPath.replace(/\.srt$/, ".captions.srt");
  try {
    renameSync(srtPath, sidecar);
    return sidecar;
  } catch {
    return srtPath;
  }
}

export interface LeafEntry {
  id: string;
  title: string;
  branch: "A" | "B" | "C";
  url: string;
  mp4Path: string;
  srtPath?: string;
  totalMs: number;
  driveFileId?: string;
  drivePreviewUrl?: string;
  uploadedAt?: string;
  recordedAt?: string;
}

export interface Manifest {
  generatedAt: string;
  leaves: LeafEntry[];
}

// Live outside Playwright's outputDir (which gets wiped between runs)
// so cumulative entries survive across spec runs.
const MANIFEST_PATH = resolve(
  import.meta.dirname,
  "../../../tmp/manifest.json",
);

function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { generatedAt: new Date().toISOString(), leaves: [] };
  }
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  } catch {
    return { generatedAt: new Date().toISOString(), leaves: [] };
  }
}

function writeManifest(m: Manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

export function appendLeafToManifest(entry: Omit<LeafEntry, "recordedAt">): void {
  const m = readManifest();
  const recordedAt = new Date().toISOString();
  const existingIdx = m.leaves.findIndex((l) => l.id === entry.id);
  const full: LeafEntry = { ...entry, recordedAt };
  if (existingIdx >= 0) {
    m.leaves[existingIdx] = { ...m.leaves[existingIdx], ...full };
  } else {
    m.leaves.push(full);
  }
  m.generatedAt = recordedAt;
  writeManifest(m);
}

export function updateLeafUpload(
  id: string,
  driveFileId: string,
  drivePreviewUrl: string,
): void {
  const m = readManifest();
  const leaf = m.leaves.find((l) => l.id === id);
  if (!leaf) return;
  leaf.driveFileId = driveFileId;
  leaf.drivePreviewUrl = drivePreviewUrl;
  leaf.uploadedAt = new Date().toISOString();
  writeManifest(m);
}

export function getManifest(): Manifest {
  return readManifest();
}

export const MANIFEST_FILE = MANIFEST_PATH;
