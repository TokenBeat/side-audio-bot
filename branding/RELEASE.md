# 发布 Runbook / Release Runbook

> TL;DR：日常开发只在 dev 上；发版一条命令 `npm run release <版本号>`，它会替你做完所有检查（包括"有没有写 release notes"）再触发流水线。

## 分支角色

| 分支 | 角色 | 规则 |
| --- | --- | --- |
| `main` | 上游镜像 | 只进不出：`git merge --ff-only upstream/main` |
| `dev` | 你的开发分支 | 上游原始命名 + `branding/` 品牌层（全部是新增文件） |
| `public` | 对外分支 | **= brand(dev)**，由脚本重建，永不手改、永不合并、永不在这里提交 |

## 日常开发

```bash
git switch dev && git pull
git switch -c feat/xxx        # 在 feat 上写代码：用上游原始命名（qwen-audio-agent 等），品牌词不要写进代码
# …开发、测试…
git switch dev && git merge feat/xxx
git push origin dev           # CI 自动跑 brand-check（品牌漂移检测）
npm run brand:publish --push  # 手动重建 public（几秒），仓库首页即刻跟上
```

## 同步上游

```bash
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout dev && git merge main
npm run brand:check           # CI 也会自动跑；报了 findings 就补 rules/keep/overlay
npm run brand:publish --push
```

## 发版（一条命令）

```bash
npm run release 0.12.0        # 支持带 v 前缀：npm run release v0.12.0
```

脚本按顺序做以下检查，**任何一步不过就退出**，不会发出残缺发布：

0. 版本号与 `branding/config.mjs` 的 `brandVersion` 一致 —— 升版本先改这里（apply 会把
   它盖写到 public 的全部 package.json / package-lock.json，设置页版本号也随之更新）；
1. 当前在 dev、工作树干净、与 origin/dev 同步（本地领先会自动推送）；
2. `branding/release-notes/<版本>.md` **存在** —— 双语描述正本，没有就拒绝（可复制 `0.11.0.md` 当模板）；
3. `branding/overlay/README.md` 与 `README_ZH.md` 的 News 区**已包含 v<版本>** 条目（`--skip-news` 可跳过此检查）；
4. 重建并推送 public（brand:publish --push）；
5. 用本机 git 凭证 dispatch `Public Release` 流水线，打印运行链接。

之后等 CI 约 15–25 分钟（macOS universal 构建最慢），Releases 页出现产物。手动兜底入口：[Actions → Public Release](https://github.com/TokenBeat/side-audio-bot/actions/workflows/public-release.yml)。

### 发版文案的两处固定动作

| 文件 | 用途 | 忘了会怎样 |
| --- | --- | --- |
| `branding/config.mjs` 的 `brandVersion` | 对外版本号（盖写全部清单） | release 脚本与流水线 gate 都会拒绝 |
| `branding/release-notes/<版本>.md` | Release 页描述（双语） | 本地 release 脚本拒绝；直接在 Actions 触发时流水线也会在 gate 阶段失败 |
| `branding/overlay/README*.md` 的 News 区 | 仓库首页快讯 | release 脚本拒绝（`--skip-news` 可跳过） |

文案结构约定：**先写本版本定位句（"side-audio-bot 首个正式版本，提供…"），再写新增内容**。参考 v0.11.0 的两条。

## 漂移检测报了 findings 怎么办

`brand:check` 列出的每个 `文件:行` 都代表上游新内容里的品牌词没有被规则覆盖。处置三选一：

- 该替换 → `branding/rules.mjs` 加一条规则（具体在前，宽泛在后）；
- 该保留（模型 ID、第三方品牌）→ `keep` 加正则；
- 该整文件覆盖 → `branding/overlay/` 加同名文件。

改完本地 `npm run brand:check` 验证通过再提交。

## 原理速查

- **重建** = `scripts/brand/apply.mjs` 在临时 worktree 里执行：`rules.mjs` 文本替换（keep 之外）→ 复制 `cli/bin/sideaudio.mjs` → 拷贝 `overlay/`（原样覆盖）→ 删除 `removeList` → 写 `manifest.json`；
- **public 的形态** = dev 完整历史 + 顶部一个 `brand: rebuild from dev@<sha>` 提交；
- **品牌态只存在于** public 分支和临时 worktree，dev 永远保持上游原名 —— 这就是上游合并零冲突的原因；
- 细节见 [REBRAND.md](REBRAND.md)（改名范围与特例）。
