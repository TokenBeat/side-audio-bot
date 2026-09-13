# 晚晴系列 · 下一个智能体的开场提示词（KICKOFF）

> 使用方法：把下面分隔线内的整段内容，作为第一句话发给新的智能体即可。
> 它会自己完成取码/更新、读交接文档、跑起来、然后按主任务继续开发。

---

你要接手「晚晴」系列的开发——一套基于实时语音框架 qwen-audio-agent 的康养产品
（机构版照护 / 居家版伴 / 家庭智能中控），前任智能体已完成三套可运行的垂直产品，
你的任务是继续开发功能，并把 UI 打磨到"大厂出品"水准（对标仓库里的智能座舱示例）。

【第一步：获取或更新代码】
仓库：https://github.com/TokenBeat/side-audio-bot
分支：product/wanqing（所有晚晴代码在这里）

- 本地还没有这个仓库时：
  git clone -b product/wanqing https://github.com/TokenBeat/side-audio-bot.git
  cd side-audio-bot
- 本地已经克隆过（任意路径存在 side-audio-bot 目录）：
  cd <该目录> && git switch product/wanqing && git pull origin product/wanqing
  必须确认 `git log --oneline -1` 是远程最新（用 `git fetch && git status` 核对
  无落后），保证代码是最新的，再开始任何工作。

【第二步：读交接文档——它是唯一事实来源】
通读 products/docs/HANDOFF.md，严格遵守其中的：
- ⭐ 当前主任务（UI 大厂化冲刺：工艺拆解表、反模式清单、验收标准）
- §1 硬约束 7 条（特别是：代码绝不进 dev 分支；只消费框架公开导出）
- §2 启动命令、§6 验证手册、§7 排坑实录（9 个已踩过的坑，别再踩）

【第三步：跑起来看看现状】
npm ci && cd products && npm install
npm run care:install && npm run home:install && npm run hub:install
npm run care &  npm run home &  npm run hub &
# 页面：care→localhost:5175(/station /room/302 /family)
#       home→localhost:5176(/elder /family)  hub→localhost:5177(/ /remote)
# 语音需在 .env.local 配 DASHSCOPE_API_KEY（模板见各产品 .env.example）

【硬性要求（用户明确表达过的）】
1. UI 必须有大厂质感，对标 examples/smart-cockpit——emoji 当图标是禁项，
   交互必须有声光反馈，每个界面截图自审至少迭代 3 轮
2. 一切面向老人的提醒/反馈必须语音主动开口说（老人不认字也能用），
   家属端必须能"注入"照护（点歌/提醒/留言由终端语音转达）
3. 健康数据监测是机构版的核心卖点，不是附属功能
4. 改动只提交到 product/wanqing 分支，dev 和 public 分支不要碰

【验证与提交】
每条业务闭环的 curl/脚本级验证方法在 HANDOFF.md §6；UI 用浏览器截图与
座舱并排对比自审。完成的工作提交到 product/wanqing 并推送 origin。
有产品决策层面的疑问再问用户，技术问题先查 HANDOFF §7 排坑表。
