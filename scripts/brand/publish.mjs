#!/usr/bin/env node
// 重建对外发布分支：public = brand(<from>)。
//
// public 分支永远不参与合并、也永远不手改 —— 每次发布都把它重置到
// <from>（默认 dev），在临时 worktree 里套用品牌层，然后作为单个
// squash 提交落库。上游历史原样保留在分支顶端之下，品牌改动集中成
// 一个可审阅的提交。
//
// 用法：node scripts/brand/publish.mjs [--from dev] [--push]
//   --from <ref>   品牌化的来源分支（默认 dev）
//   --push         完成后 git push --force-with-lease origin public

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : 'dev';
const push = args.includes('--push');

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
const git = (args2, cwd = brandRepo) =>
  execFileSync('git', args2, { cwd, encoding: 'utf8' }).replace(/\n$/, '');

if (git(['status', '--porcelain']) !== '') {
  console.error('[brand:publish] checkout is dirty — commit or stash first.');
  process.exit(1);
}

const baseSha = git(['rev-parse', '--short', from]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-publish-'));
console.log(`[brand:publish] rebuilding public from ${from}@${baseSha}`);

execFileSync('git', ['worktree', 'add', '-B', 'public', tmp, from], { cwd: brandRepo, stdio: 'pipe' });
try {
  execFileSync(process.execPath, [path.join(brandRepo, 'scripts', 'brand', 'apply.mjs')], {
    cwd: tmp,
    stdio: 'inherit',
  });
  git(['add', '-A'], tmp);
  if (git(['status', '--porcelain'], tmp) === '') {
    console.log('[brand:publish] branded tree identical to previous public — nothing to commit');
  } else {
    git(['commit', '-m', `brand: rebuild from ${from}@${baseSha}`], tmp);
  }
  const tip = git(['log', '-1', '--format=%h %s'], tmp);
  console.log(`[brand:publish] public => ${tip}`);
  if (push) {
    execFileSync('git', ['push', '--force-with-lease', 'origin', 'public'], {
      cwd: brandRepo,
      stdio: 'inherit',
    });
    console.log('[brand:publish] pushed origin/public');
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', tmp], { cwd: brandRepo, stdio: 'pipe' });
}
