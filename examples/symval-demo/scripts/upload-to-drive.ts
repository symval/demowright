#!/usr/bin/env bun
/**
 * Upload every leaf .mp4 in manifest.json to Google Drive via `gws` CLI,
 * grant role=reader/type=anyone permission, and record the fileId in the
 * manifest so the d3 graph viewer can embed each /preview iframe.
 *
 * Usage:
 *   bun run examples/symval-demo/scripts/upload-to-drive.ts          # all
 *   bun run examples/symval-demo/scripts/upload-to-drive.ts A2 A3    # subset
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getManifest, updateLeafUpload } from "./manifest.js";

const ROOT_FOLDER_NAME = "SymVal Demo Videos";

interface DriveFile {
  id: string;
  name: string;
}

function gws(args: string[], opts?: { input?: string }): string {
  return execFileSync("gws", args, {
    encoding: "utf-8",
    input: opts?.input,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

function findOrCreateFolder(name: string): string {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listRaw = gws([
    "drive",
    "files",
    "list",
    "--params",
    JSON.stringify({ q, fields: "files(id,name)" }),
  ]);
  const list = JSON.parse(listRaw) as { files?: DriveFile[] };
  if (list.files && list.files.length > 0) {
    return list.files[0].id;
  }
  const created = JSON.parse(
    gws([
      "drive",
      "files",
      "create",
      "--json",
      JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
      }),
    ]),
  ) as DriveFile;
  return created.id;
}

function uploadMp4(localPath: string, name: string, parentId: string): DriveFile {
  const json = JSON.stringify({ name, parents: [parentId] });
  const raw = gws([
    "drive",
    "files",
    "create",
    "--json",
    json,
    "--upload",
    localPath,
    "--upload-content-type",
    "video/mp4",
  ]);
  return JSON.parse(raw) as DriveFile;
}

function grantPublicRead(fileId: string): void {
  gws([
    "drive",
    "permissions",
    "create",
    "--params",
    JSON.stringify({ fileId }),
    "--json",
    JSON.stringify({ role: "reader", type: "anyone" }),
  ]);
}

function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

async function main() {
  const filter = process.argv.slice(2);
  const manifest = getManifest();
  if (manifest.leaves.length === 0) {
    console.error("manifest.json is empty — record some leaves first.");
    process.exit(1);
  }

  const folderId = findOrCreateFolder(ROOT_FOLDER_NAME);
  console.log(`[drive] Folder: ${ROOT_FOLDER_NAME} (${folderId})`);

  const targets = filter.length === 0 ? manifest.leaves : manifest.leaves.filter((l) => filter.includes(l.id));

  for (const leaf of targets) {
    if (leaf.driveFileId) {
      console.log(`[drive] ${leaf.id} already uploaded as ${leaf.driveFileId}, skip`);
      continue;
    }
    if (!existsSync(leaf.mp4Path)) {
      console.warn(`[drive] ${leaf.id} mp4 not found at ${leaf.mp4Path}, skip`);
      continue;
    }
    console.log(`[drive] uploading ${leaf.id} (${leaf.mp4Path})`);
    const file = uploadMp4(leaf.mp4Path, `symval-${leaf.id}-${leaf.title}.mp4`, folderId);
    grantPublicRead(file.id);
    const preview = previewUrl(file.id);
    updateLeafUpload(leaf.id, file.id, preview);
    console.log(`[drive]   → ${file.id}  ${preview}`);
  }
  console.log("[drive] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
