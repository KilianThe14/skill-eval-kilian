import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
}

export async function walkFiles(root) {
  const results = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (![".git", "node_modules", ".skill-eval"].includes(entry.name)) {
          await visit(next);
        }
      } else if (entry.isFile()) {
        results.push(next);
      }
    }
  }
  if (await pathExists(root)) {
    await visit(root);
  }
  return results;
}

export async function copyDirectory(source, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, { recursive: true });
}

export async function snapshotWorkspace(root) {
  const files = await walkFiles(root);
  const entries = [];
  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    entries.push({
      path: path.relative(root, filePath),
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function diffSnapshots(before, after) {
  const beforeMap = new Map(before.map((item) => [item.path, item]));
  const afterMap = new Map(after.map((item) => [item.path, item]));
  const changes = [];
  for (const item of after) {
    const previous = beforeMap.get(item.path);
    if (!previous) {
      changes.push({ path: item.path, status: "added" });
    } else if (previous.size !== item.size || previous.mtimeMs !== item.mtimeMs) {
      changes.push({ path: item.path, status: "modified" });
    }
  }
  for (const item of before) {
    if (!afterMap.has(item.path)) {
      changes.push({ path: item.path, status: "deleted" });
    }
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
