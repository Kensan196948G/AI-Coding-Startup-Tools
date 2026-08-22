import fs from "node:fs";
import path from "node:path";

export function isGitProject(directory) {
  return fs.existsSync(path.join(directory, ".git"));
}

export function isBootstrapped(directory) {
  return fs.existsSync(path.join(directory, ".deepseek-coding-tools"));
}

export function listProjects(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(root, entry.name))
    .filter(isGitProject)
    .map((project) => ({ name: path.basename(project), path: project, bootstrapped: isBootstrapped(project) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function canonicalizePath(candidate) {
  const absolute = path.resolve(candidate);
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    existing = parent;
  }
  try { return fs.realpathSync(existing) + absolute.slice(existing.length); }
  catch { return absolute; }
}

export function isInsideRoot(root, candidate) {
  const canonicalRoot = canonicalizePath(root);
  const canonicalCandidate = canonicalizePath(candidate);
  return canonicalCandidate === canonicalRoot || canonicalCandidate.startsWith(canonicalRoot + path.sep);
}

export function resolveInsideRoot(root, candidate) {
  const canonical = canonicalizePath(candidate);
  return isInsideRoot(root, canonical) ? canonical : null;
}

export function basenameOfPath(value) {
  const segments = String(value).split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] || String(value);
}

export function listProjectsForRoots(roots) {
  return roots.map((root) => ({ root, label: basenameOfPath(root), projects: listProjects(root) }));
}
