#!/usr/bin/env node
// 一条命令发版：校验 → 重建 public → dispatch 发布流水线。
//
// 用法：npm run release 0.12.0   （或 npm run release v0.12.0）
//
// 防呆清单（任何一步不过就退出，绝不发出残缺的发布）：
//   1. 当前在 dev、工作树干净（忽略未跟踪文件）、与 origin/dev 同步
//   2. branding/release-notes/<version>.md 存在（双语描述正本）
//   3. branding/overlay/README.md 与 README_ZH.md 的 News 已包含 v<version>
//   4. 重建并推送 public（brand:publish --push）
//   5. 用本机 git 凭证 dispatch public-release workflow，打印运行链接
// 凭证缺失时打印手动触发入口，前四步的成果不受影响。
// 完整流程文档见 branding/RELEASE.md。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const rawVersion = args.find((a) => !a.startsWith('--'));
const skipNews = args.includes('--skip-news');

if (!rawVersion) {
  console.error('usage: npm run release <version>    e.g. npm run release 0.12.0');
  process.exit(1);
}
const version = rawVersion.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`[release] ✗ invalid version '${rawVersion}' (expected e.g. 0.12.0 or v0.12.0)`);
  process.exit(1);
}

const fail = (msg) => {
  console.error(`[release] ✗ ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`[release] ✓ ${msg}`);

function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`not inside a git repository: ${start}`);
    dir = parent;
  }
}

const repo = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const git = (a, cwd = repo) => execFileSync('git', a, { cwd, encoding: 'utf8' }).replace(/\n$/, '');

// ---- 1. dev 状态 ----
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'dev') fail(`当前在 ${branch}，请先 git switch dev`);
if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
  fail('dev 工作树有未提交改动，先 commit 或 stash');
}
git(['fetch', 'origin', 'dev']);
const ahead = git(['rev-list', '--count', 'origin/dev..dev']);
const behind = git(['rev-list', '--count', 'dev..origin/dev']);
if (behind !== '0') fail('本地 dev 落后 origin/dev，请先 git pull');
if (ahead !== '0') {
  console.log('[release] · 推送本地 dev…');
  git(['push', 'origin', 'dev']);
}
ok(`dev 已同步（${git(['rev-parse', '--short', 'HEAD'])}）`);

// ---- 2. release notes ----
const notesRel = `branding/release-notes/${version}.md`;
if (!fs.existsSync(path.join(repo, ...notesRel.split('/')))) {
  fail(`缺少 ${notesRel} —— 先写双语描述（可复制 0.11.0.md 作模板），commit 后重试；没有它发布页会退化成自动生成的英文 notes`);
}
ok(`release notes 存在（${notesRel}）`);

// ---- 3. README News ----
if (!skipNews) {
  for (const file of ['README.md', 'README_ZH.md']) {
    const text = fs.readFileSync(path.join(repo, 'branding', 'overlay', file), 'utf8');
    if (!text.includes(`v${version}`)) {
      fail(`${file} 的 News 区还没有 v${version} 条目 —— 更新 branding/overlay/${file} 后重试`);
    }
  }
  ok('README News 已包含本版本');
} else {
  console.log('[release] · 跳过 README News 检查（--skip-news）');
}

// ---- 4. 重建 public ----
execFileSync(process.execPath, [path.join(repo, 'scripts', 'brand', 'publish.mjs'), '--push'], {
  cwd: repo,
  stdio: 'inherit',
});
ok('public 已重建并推送');

// ---- 5. dispatch 发布流水线 ----
const originUrl = git(['remote', 'get-url', 'origin']);
const ownerRepo = originUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
if (!ownerRepo) fail(`无法从 origin 解析 GitHub 仓库：${originUrl}`);
const runUrlBase = `https://github.com/${ownerRepo}/actions/workflows/public-release.yml`;

const creds = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
});
const user = creds.match(/^username=(.*)$/m)?.[1];
const token = creds.match(/^password=(.*)$/m)?.[1];

if (!user || !token) {
  console.log(`[release] · 本机没有存储的 GitHub 凭证，请手动触发：${runUrlBase}`);
  process.exit(0);
}

const response = await fetch(
  `https://api.github.com/repos/${ownerRepo}/actions/workflows/public-release.yml/dispatches`,
  {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
    },
    body: JSON.stringify({ ref: 'public', inputs: { version } }),
  }
);

if (response.status === 204) {
  ok(`已触发 v${version} 发布流水线`);
} else if (response.status === 404) {
  fail(
    'workflow 未注册（通常因为默认分支不是 public，或 public 上没有 public-release.yml）；'
      + `也可稍后在 Actions 页面手动触发：${runUrlBase}`
  );
} else if (response.status === 401 || response.status === 403) {
  fail(`本机凭证权限不足（HTTP ${response.status}），请到 Actions 页面手动触发：${runUrlBase}`);
} else {
  fail(`dispatch 失败（HTTP ${response.status}）：${await response.text()}`);
}

// ---- 6. 打印运行链接 ----
await new Promise((resolve) => setTimeout(resolve, 8000));
const runs = await fetch(
  `https://api.github.com/repos/${ownerRepo}/actions/workflows/public-release.yml/runs?per_page=1`
).then((r) => r.json());
const run = runs.workflow_runs?.[0];
if (run) {
  console.log(`[release] → 运行中：${run.html_url}`);
  console.log(`[release]   预计 15–25 分钟，完成后 Release 页出现 v${version} 产物`);
} else {
  console.log(`[release] → 进度查看：${runUrlBase}`);
}
