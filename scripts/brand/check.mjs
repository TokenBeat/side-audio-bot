#!/usr/bin/env node
// 品牌层验证：不动任何真实工作树，全部在临时 worktree 里完成。
//
//   1. 对 HEAD 建临时 worktree，套用品牌层；
//   2. 再套用一次，证明幂等；
//   3. 扫描品牌态树中"规则和 keep 清单都解释不了"的品牌 token ——
//      即上游更新带来的漂移（新文件、新环境变量、新文案里的 qwen 字样）；
//   4. 校验品牌态产物存在（cli/bin/sideaudio.mjs、旧入口已删除）。
//
// 有任何 finding 则退出码 1。--keep 保留临时 worktree 便于排查。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keep as keepPatterns } from '../../branding/rules.mjs';

const keepWorktree = process.argv.includes('--keep');
const brandRepo = findRoot(path.dirname(fileURLToPath(import.meta.url)));

function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`not inside a git repository: ${start}`);
    dir = parent;
  }
}

const git = (args, cwd = brandRepo) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\n$/, '');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-check-'));
execFileSync('git', ['worktree', 'add', '--detach', tmp, 'HEAD'], { cwd: brandRepo, stdio: 'pipe' });

const findings = [];
try {
  const apply = () =>
    execFileSync(process.execPath, [path.join(brandRepo, 'scripts', 'brand', 'apply.mjs')], {
      cwd: tmp,
      encoding: 'utf8',
    });
  apply();
  const hash1 = treeHash(tmp);
  apply();
  if (treeHash(tmp) !== hash1) findings.push('apply is not idempotent');

  // 残留品牌 token 扫描：keep 之外的任何 qwen/qwaudio 字样都是漂移
  const KEEP = keepPatterns.map((re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  const BINARY_EXT = /\.(png|jpe?g|gif|icns|ico|webp|avif|woff2?|ttf|otf|eot|mp3|wav|ogg|flac|m4a|zip|gz|tgz|bz2|xz|7z|rar|pdf|bin|exe|dll|dylib|so|node|wasm|pyc|class|jar|pack|idx|keystore|jks|der|p12|bmp|tiff|db|sqlite)$/i;
  const ALLOW_PATHS = [
    /^branding\//,
    /^scripts\/brand\//,
    /^REBRAND\.md$/,
    /^NOTICE$/,
    /^THIRD_PARTY_NOTICES\.md$/,
    /^docs\/qwen-audio-agent-(?:three|two)-layer-architecture/, // 约定保留的旧架构图（文件名与内文）
    /^package-lock\.json$/, // 依赖完整性哈希里可能偶然含 qwen 子串，纯误报
  ];

  for (const file of walk(tmp)) {
    const rel = path.relative(tmp, file).split(path.sep).join('/');
    if (rel.startsWith('.git/') || rel.startsWith('node_modules/')) continue;
    if (ALLOW_PATHS.some((re) => re.test(rel))) continue;
    const buf = fs.readFileSync(file);
    if (BINARY_EXT.test(rel) || buf.subarray(0, 8192).includes(0)) continue;
    const text = buf.toString('utf8');
    const spans = [];
    for (const re of KEEP) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        spans.push([m.index, m.index + m[0].length]);
      }
    }
    const inKeep = (idx) => spans.some(([s, e]) => idx >= s && idx < e);
    const lines = text.split('\n');
    let offset = 0;
    for (const [lineNo, line] of lines.entries()) {
      for (const m of line.matchAll(/qwen|qwaudio/gi)) {
        if (!inKeep(offset + m.index)) {
          findings.push(`${rel}:${lineNo + 1}: …${line.slice(Math.max(0, m.index - 40), m.index + 60).trim()}…`);
        }
      }
      offset += line.length + 1;
    }
  }

  // 品牌态产物校验
  if (!fs.existsSync(path.join(tmp, 'cli', 'bin', 'sideaudio.mjs'))) {
    findings.push('cli/bin/sideaudio.mjs missing after apply');
  }
  if (fs.existsSync(path.join(tmp, 'cli', 'bin', 'qwenaudio.mjs'))) {
    findings.push('cli/bin/qwenaudio.mjs still present after apply (removeList missed)');
  }

  const head = git(['rev-parse', '--short', 'HEAD']);
  if (findings.length === 0) {
    console.log(`[brand:check] OK — no drift at ${head}`);
  } else {
    console.error(`[brand:check] ${findings.length} finding(s) at ${head}:`);
    for (const f of findings) console.error(`  - ${f}`);
    console.error('[brand:check] fix = new rule / keep entry / overlay file in branding/');
  }
} finally {
  if (keepWorktree) console.log(`[brand:check] worktree kept at ${tmp}`);
  else execFileSync('git', ['worktree', 'remove', '--force', tmp], { cwd: brandRepo, stdio: 'pipe' });
}
process.exit(findings.length === 0 ? 0 : 1);

// ---- helpers ---------------------------------------------------------------

function treeHash(root) {
  const hash = createHash('sha256');
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('.git/') || rel.startsWith('branding/')) continue; // manifest 每轮不同，排除
    hash.update(rel);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}
