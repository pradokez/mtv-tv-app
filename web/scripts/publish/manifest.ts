/**
 * The manifest published next to the site (`manifest.json`). The Android shell
 * reads it to know whether there is a newer version and which files to download,
 * checking each one against its hash.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The oldest Android shell (its `versionCode`) able to run this web build.
 * Raise it when the web needs something new from the native side (a bridge, a
 * setting): older shells then keep the version they have instead of breaking.
 */
export const MIN_SHELL = 1;

export type Manifest = {
  version: string;
  minShell: number;
  files: { path: string; sha256: string; size: number }[];
};

/** Not part of the downloadable site: Pages marker and the manifest itself. */
const EXCLUDED = new Set([".nojekyll", "manifest.json"]);

function listFiles(root: string, relative = ""): string[] {
  return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFiles(root, path);
    return EXCLUDED.has(path) ? [] : [path];
  });
}

/** Describes every file of the build in `dir`, tagged as release `version`. */
export function buildManifest(dir: string, version: string): Manifest {
  const files = listFiles(dir)
    .sort()
    .map((path) => {
      const content = readFileSync(join(dir, path));
      return { path, sha256: createHash("sha256").update(content).digest("hex"), size: content.length };
    });
  return { version, minShell: MIN_SHELL, files };
}
