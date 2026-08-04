// 統合元リポジトリの棚卸しエントリ生成 (Phase 0/1 支援)
// 使い方:
//   node scripts/migration/build-inventory.mjs --repo-dir <クローン先> --source-repository <リポジトリ名> [--out <出力先>]
// 出力は inventory.yml へ追記可能な YAML 形式。decision はすべて unresolved (要レビュー)。

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const HELP = `使い方:
  node scripts/migration/build-inventory.mjs --repo-dir <path> --source-repository <name> [--out <file>]

オプション:
  --repo-dir <path>           統合元リポジトリのクローン先
  --source-repository <name>  統合元リポジトリ名 (例: Claude-StartUpTools-New-Linux)
  --out <file>                出力先ファイル (省略時は標準出力)
  --help                      このヘルプを表示
`;

function parseArgs(argv) {
  const args = { repoDir: "", sourceRepository: "", out: "" };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo-dir": args.repoDir = argv[++i] || ""; break;
      case "--source-repository": args.sourceRepository = argv[++i] || ""; break;
      case "--out": args.out = argv[++i] || ""; break;
      case "--help": case "-h": console.log(HELP); process.exit(0); break;
      default:
        console.error(`不明なオプション: ${argv[i]}`);
        console.error(HELP);
        process.exit(2);
    }
  }
  return args;
}

function gitHead(repoDir) {
  const res = spawnSync("git", ["-C", repoDir, "rev-parse", "HEAD"], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "pending";
}

function sha256Of(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walkFiles(root) {
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function guessCategory(rel) {
  const lower = rel.toLowerCase();
  if (/(^|\/)install-?check\.(sh|ps1)$/.test(lower)) return "install-check";
  if (/(^|\/)launch\.(sh|ps1)$/.test(lower)) return "launcher";
  if (/(^|\/)(start|bootstrap|diagnose|test-)[^/]*\.(sh|ps1|psm1)$/.test(lower)) return "script";
  if (/prompt/i.test(lower)) return "prompt";
  if (/template/i.test(lower)) return "template";
  if (/\.(ya?ml|json)$/.test(lower)) return "config";
  if (/\.(md|rst|txt)$/.test(lower)) return "doc";
  return "other";
}

function guessTargetPath(sourceRepository, rel) {
  const name = sourceRepository.toLowerCase();
  const lower = rel.toLowerCase();
  const isWindows = /windows/.test(name) || /\.ps1$/.test(lower) || /\.psm1$/.test(lower);
  const isCodex = /codex/.test(name);
  const isClaude = /claude/.test(name);
  const tool = isCodex ? "codex" : isClaude ? "claude-code" : "common";
  const os = isWindows ? "windows" : "linux";
  const category = guessCategory(rel);
  const base = path.basename(rel);

  if (category === "launcher" || category === "install-check") {
    return `${tool}/${os}/${base}`;
  }
  if (category === "prompt") {
    return `prompts/${tool}/${base}`;
  }
  if (category === "template") {
    return `templates/${base.replace(/\.[^.]+$/, "")}/template${path.extname(rel)}`;
  }
  if (category === "config") {
    return `${tool}/common/${base}`;
  }
  return `docs/migration/source/${name}/${rel}`;
}

function emitYaml(assets) {
  const lines = ["schemaVersion: 1", "assets:"];
  for (const a of assets) {
    lines.push("  - sourceRepository: " + a.sourceRepository);
    lines.push("    sourcePath: " + a.sourcePath);
    lines.push("    sourceCommit: " + a.sourceCommit);
    lines.push("    sha256: " + a.sha256);
    lines.push("    category: " + a.category);
    lines.push("    targetPath: " + a.targetPath);
    lines.push("    decision: unresolved");
    lines.push("    status: planned");
    lines.push("    reason: 自動生成エントリ。内容確認後に decision を更新してください。");
  }
  return lines.join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.repoDir || !args.sourceRepository) {
    console.error("--repo-dir と --source-repository は必須です。");
    console.error(HELP);
    process.exit(2);
  }
  if (!fs.existsSync(args.repoDir)) {
    console.error(`リポジトリディレクトリが見つかりません: ${args.repoDir}`);
    process.exit(2);
  }

  const head = gitHead(args.repoDir);
  const files = walkFiles(args.repoDir);
  const assets = files
    .map((file) => {
      const rel = path.relative(args.repoDir, file).replace(/\\/g, "/");
      return {
        sourceRepository: args.sourceRepository,
        sourcePath: rel,
        sourceCommit: head,
        sha256: sha256Of(file),
        category: guessCategory(rel),
        targetPath: guessTargetPath(args.sourceRepository, rel),
      };
    })
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

  const yaml = emitYaml(assets);
  if (args.out) {
    fs.writeFileSync(args.out, yaml, "utf8");
    console.log(`生成しました: ${args.out} (${assets.length} 件)`);
  } else {
    process.stdout.write(yaml);
    console.error(`(標準出力: ${assets.length} 件)`);
  }
}

main();
