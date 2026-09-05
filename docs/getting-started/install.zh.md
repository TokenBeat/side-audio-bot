# 安装

需要 Node.js ^22.22.2、^24.15.0 或 >=26.0.0，npm 10+。使用默认的 DashScope
实时语音前台时，还需要 DashScope API Key。
仓库提供 `.nvmrc` 和 `.node-version`；使用 nvm 时可直接运行 `nvm use`。

## 一键安装

推荐从 npm 安装：

```bash
npm install -g side-audio-bot
```

也可以直接从 GitHub 安装最新代码：

```bash
npm install -g git+https://github.com/TokenBeat/side-audio-bot.git
```

## 从源码安装

```bash
git clone https://github.com/TokenBeat/side-audio-bot.git
cd side-audio-bot
npm install
npm run install:global
```

## 升级

升级到最新 npm 版本：

```bash
npm install -g side-audio-bot@latest
```

升级到 GitHub 最新代码：

```bash
npm install -g git+https://github.com/TokenBeat/side-audio-bot.git
```

升级后如果以后台服务方式运行 Gateway，需执行 `sideaudio gateway restart` 让新版本生效。

## 验证安装

查看配置文件的准确位置并确认安装就绪：

```bash
sideaudio config
```

配置后台 Agent 后，可运行只读检查确认后台可执行文件、ACP 接入和适配器是否就绪：

```bash
sideaudio setup
```

## 配置文件位置

CLI 与桌面版共享 `~/.config/sideaudio/config.env`（设置、身份、记忆与共享 workspace
都在同一个用户目录下）。只有运行时状态——Gateway 进程、锁、日志与皮肤——存放在桌面版
自己的应用数据目录（macOS 为 `~/Library/Application Support/Side Audio Bot`），两者可以同时运行。设置 `SIDEAUDIO_CONFIG_DIR` 或
`XDG_CONFIG_HOME` 可以更改配置目录。详见[配置说明](../configuration.zh.md)。

## 获取 DashScope API Key

阿里云百炼为 Qwen Audio 3.0 Realtime 提供
[新人免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota)，创建 API Key 后
即可免费开始使用 side-audio-bot。

1. 打开百炼控制台的 [API Key 页面](https://bailian.console.aliyun.com/?tab=model#/api-key)，
   登录账号，单击**创建 API Key**。
2. 复制生成的 Key，稍后填入 `config.env`。请勿公开或提交 API Key。

详细说明见[百炼官方文档](https://help.aliyun.com/zh/model-studio/get-api-key)。
