#!/usr/bin/env node
// 把 Side Audio Bot 品牌层套用到一棵 git 工作树上。
//
// 该脚本对目标工作树是破坏性的（原地改写跟踪文件），因此拒绝在主 checkout
// （.git 是目录的地方）运行 —— 只允许在专用 worktree 中执行：
//   - scripts/brand/publish.mjs  重建 public 分支
//   - scripts/brand/check.mjs    临时 worktree 验证
//
// 规则与 overlay 素材取自"包含本脚本的仓库"（branding/），
// 被转换的目标树是"当前工作目录"——两者可以不是同一棵树。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rules, keep, skipPaths, removeList } from '../../branding/rules.mjs';

const force = process.argv.includes('--force');

function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`not inside a git repository: ${start}`);
    dir = parent;
  }
}

const brandRepo = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const targetRoot = findRoot(process.cwd());

const dotGit = path.join(targetRoot, '.git');
if (fs.statSync(dotGit).isDirectory() && !force) {
  console.error(
    '[brand:apply] refusing to run on a primary checkout (would rewrite tracked files in place).\n'
      + '[brand:apply] use scripts/brand/publish.mjs or scripts/brand/check.mjs, or pass --force to override.'
  );
  process.exit(1);
}

const git = (args, cwd = targetRoot) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\n$/, '');

// ---- keep 保护 + 规则替换 -------------------------------------------------

const KEEP = keep.map((re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));

function keepSpans(text) {
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
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  return merged;
}

function applyRules(text) {
  let out = text;
  for (const rule of rules) out = out.split(rule.from).join(rule.to);
  return out;
}

function brandText(text) {
  const spans = keepSpans(text);
  if (spans.length === 0) return applyRules(text);
  let out = '';
  let pos = 0;
  for (const [start, end] of spans) {
    out += applyRules(text.slice(pos, start)) + text.slice(start, end);
    pos = end;
  }
  out += applyRules(text.slice(pos));
  return out;
}

// ---- 文件遍历 --------------------------------------------------------------

const BINARY_EXT = /\.(png|jpe?g|gif|icns|ico|webp|avif|woff2?|ttf|otf|eot|mp3|wav|ogg|flac|m4a|zip|gz|tgz|bz2|xz|7z|rar|pdf|bin|exe|dll|dylib|so|node|wasm|pyc|class|jar|pack|idx|keystore|jks|der|p12|bmp|tiff|db|sqlite)$/i;
const looksBinary = (buf) => buf.subarray(0, 8192).includes(0);
const isSkipped = (rel) => skipPaths.some((re) => re.test(rel));

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

// ---- 主流程 ----------------------------------------------------------------

const modified = [];
const copied = [];
const removed = [];

// 1. 文本替换：只作用于 git 跟踪的文件
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
for (const rel of tracked) {
  if (isSkipped(rel) || BINARY_EXT.test(rel)) continue;
  const abs = path.join(targetRoot, rel);
  // removeList 可能已在本轮或上一轮删除该文件（幂等重跑时 git 仍跟踪它）
  if (!fs.existsSync(abs)) continue;
  const buf = fs.readFileSync(abs);
  if (looksBinary(buf)) continue;
  const next = brandText(buf.toString('utf8'));
  if (next !== buf.toString('utf8')) {
    fs.writeFileSync(abs, next);
    modified.push(rel);
  }
}

// 2. CLI bin：上游入口已在上一步完成改名，复制出品牌态入口
const binSrc = path.join(targetRoot, 'cli', 'bin', 'qwenaudio.mjs');
if (fs.existsSync(binSrc)) {
  const binDest = path.join(targetRoot, 'cli', 'bin', 'sideaudio.mjs');
  fs.copyFileSync(binSrc, binDest);
  copied.push('cli/bin/sideaudio.mjs');
}

// 3. overlay：人工维护的品牌文件整树覆盖（原样复制，不再做文本替换）
const overlayDir = path.join(brandRepo, 'branding', 'overlay');
if (fs.existsSync(overlayDir)) {
  for (const file of walk(overlayDir)) {
    const rel = path.relative(overlayDir, file).split(path.sep).join('/');
    const dest = path.join(targetRoot, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    copied.push(rel);
  }
}

// 4. removeList：品牌态需要移除的上游文件
for (const rel of removeList) {
  const abs = path.join(targetRoot, ...rel.split('/'));
  if (fs.existsSync(abs)) {
    fs.rmSync(abs);
    removed.push(rel);
  }
}

// 5. manifest（确定性输出，便于幂等校验）
const manifest = {
  base: git(['rev-parse', 'HEAD']),
  rulesReplaced: modified.length,
  modified,
  copied,
  removed,
};
fs.mkdirSync(path.join(targetRoot, 'branding'), { recursive: true });
fs.writeFileSync(
  path.join(targetRoot, 'branding', 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(
  `[brand:apply] base=${manifest.base} modified=${modified.length} copied=${copied.length} removed=${removed.length}`
);
for (const rel of copied) console.log(`  copied : ${rel}`);
for (const rel of removed) console.log(`  removed: ${rel}`);
