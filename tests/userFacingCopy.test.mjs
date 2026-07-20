import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(".");
const forbidden = String.fromCodePoint(0x4e3b, 0x4eba);
const scanRoots = ["src", "tests", "README.md", "store", "docs", "MissionCenter"];

async function collectFiles(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = await import("node:fs/promises").then(({ stat }) => stat(absolutePath));
  if (stat.isFile()) return [absolutePath];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(relativePath, entry.name);
    return entry.isDirectory() ? collectFiles(child) : [path.join(rootDir, child)];
  }));
  return nested.flat();
}

test("user-facing source and project documents use neutral user wording", async () => {
  const files = (await Promise.all(scanRoots.map(collectFiles))).flat();
  const matches = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes(forbidden)) matches.push(path.relative(rootDir, file));
  }
  assert.deepEqual(matches, []);
});