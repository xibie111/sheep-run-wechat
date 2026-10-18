# 小羊快跑 · 微信小游戏移植

基于 **Phaser 4.2.1 + TypeScript + Vite** 的微信小游戏独立工程，复用本仓库内的跑酷源码、像素素材、皮肤、收藏与送信系统，提供微信宿主适配、资源拆包和构建核验。

微信开发者工具请选择 **小游戏**，生成的工程配置为 `compileType: "game"`。本仓库自包含源码、素材和依赖，不需要其他项目目录，也不需要 Codex。

## 当前状态

本地测试、类型检查和构建可分别执行；成功构建只代表本地流水线及产物完整性通过。

微信平台完整验收尚未完成。此前开发者工具验证出现过主循环停滞和自动化连接异常，尚未证实全部修复；真实 HTTPS 素材加载、完整包体统计、Android/iOS 微信真机、音频和长时间性能仍需验证。没有素材域名时，远程内容会显示明确的加载失败提示，不能当作完整可玩包。

## 开发依赖

推荐 **Windows + Node.js 24 + Microsoft Edge**；本次使用 Node.js `24.14.0`。命令行脚本默认使用 Edge 的 `msedge` 浏览器通道，因此构建机需要安装 Edge。

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| Phaser | 4.2.1 | 游戏引擎；移植入口及游戏系统共用此版本 |
| TypeScript | 7.0.2 | 网页准备源码与微信适配的类型检查 |
| Vite | 8.3.1 | 网页准备构建、小游戏 IIFE 打包 |
| Vitest | 5.0.2 | 游戏逻辑与微信适配单元测试 |
| Playwright | 1.62.1 | 离线运行网页，导出真实纹理、帧、动画与字库；浏览器模拟回归 |
| npm / pnpm | 本次 npm 11.9.0 / pnpm 12.3.4 | 安装依赖；两种锁文件均保留 |

上述 JavaScript 依赖记录在 `package.json` 与锁文件中。Playwright 从本项目的 `node_modules` 加载；`UI_PLAYWRIGHT_PATH` 仅用于已有环境的显式覆盖。正常构建不依赖开发机的 Codex 缓存目录。

清单仍保留迁移时继承的 `@capacitor/core`、`@capacitor/android` 和 `@capacitor/cli` `8.5.2`。微信构建不会调用 Capacitor，本仓库没有 Android 原生工程，运行微信流水线不需要 JDK 或 Android SDK。

### 平台与可选工具

- **微信开发者工具**：用于导入、调试和统计实际包体，需自行安装。此前验证环境为 Stable `2.02.2608080`、基础库 `3.17.4`；这不是当前真机兼容性的保证。
- **自己的小游戏 AppID**：填写在本地配置，源码仓库不包含本机 AppID 或私有配置。
- **HTTPS 静态素材目录**：需使用自己可配置到小游戏合法域名的地址，保持生成的 `textures/` 路径；仅发布源码不会自动创建素材托管。
- **Python 3 + Pillow**：仅旧 PoC 构建及部分素材加工脚本需要；主命令 `wechat:build` 不调用 Python。
- **`@napi-rs/canvas` 0.1.100**：仅可选的无浏览器合成宿主检查需要。可单独执行 `npm install --no-save @napi-rs/canvas@0.1.100` 后运行 `node tools/wechat-full-host-review.mjs`；合成宿主通过不代表微信平台通过。

## 安装与构建

```powershell
git clone https://github.com/xibie111/sheep-run-wechat.git
cd sheep-run-wechat
npm ci
Copy-Item wechat/local.config.example.json wechat/local.config.json
```

也可以使用 `pnpm install --frozen-lockfile` 安装，选择一种包管理器即可。

编辑 `wechat/local.config.json`：

```json
{
  "appid": "填写自己的小游戏 AppID",
  "renderer": "auto",
  "fullAssetMode": "hybrid",
  "assetBaseUrl": "https://自己的素材域名/项目路径/"
}
```

`assetBaseUrl` 应以 `/` 结尾，不能带用户名、密码、查询参数或片段。将本次构建清单 `remoteFiles` 中的 PNG 放到该地址下，保留 `textures/<hash>.png` 路径，并按微信平台要求配置合法域名及图片跨域响应。

```powershell
npm test
npm run typecheck
npm run wechat:typecheck
npm run wechat:build
npm run wechat:verify
```

流水线自动执行：网页准备构建 → Playwright/Edge 纹理捕获 → 微信小游戏独立打包 → 来源哈希、素材、字体、动画及磁盘包体估算核验。

| 目录 | 内容 |
| --- | --- |
| `builds/wechat-full/` | 导入微信开发者工具的小游戏候选 |
| `builds/wechat-full-remote/` | 外置素材缓存；只托管当前候选 `build-manifest.json` 的 `remoteFiles`，不要混入历史缓存 |
| `builds/wechat-full-runtime/` | 离线纹理捕获的中间产物 |
| `reports/wechat-full/` | 本机生成的独立构建与验证报告 |

不要把源码根目录、`src/` 或素材目录直接作为小游戏工程导入。`npm run build` 单独执行时，只完成微信构建所需的网页准备步骤。

### 诊断与回归

```powershell
# 微信适配单元测试
npm run wechat:test

# 全部素材放在包内的本地诊断候选，通常超过包体预算
npm run wechat:build:local

# 浏览器 wx facade 回归；需要对应候选已构建
npm run wechat:review
```

`wechat:build:local` 输出 `builds/wechat-full-local/`，供诊断使用；它不能替代满足包体限制的正式候选。包体核验是当前脚本的本地磁盘估算，微信工具的真实统计需另行执行。

## 本次发布前验证

2026-10-18 在独立目录执行：

- 干净目录 `npm ci` 安装通过，Phaser、Playwright、Vite、TypeScript 与 Vitest 均由该目录解析。
- 138 个测试文件、1654 项测试通过；网页准备与微信适配的类型检查通过。
- 完整构建及产物核验通过，1154 项来源哈希匹配；437 纹理、5 字库、252 动画。
- 本地磁盘估算：主包 3,730,035 字节，总包 28,850,516 字节；106 个外置 PNG 共 74,925,268 字节。
- 本轮未运行微信开发者工具或 Android/iOS 微信真机；HTTPS 素材地址仍未配置。上述数字不能替代平台实际包体或性能验收。

## 工程结构

```text
wechat/src/       微信入口、Canvas/触摸/存储/音频/生命周期适配
wechat/*.json     游戏配置、类型配置和本地配置模板
src/              本仓库独立复制的游戏逻辑及界面
assets/           原始素材、运行图集、字体及许可证
tools/wechat-*    纹理捕获、小游戏打包、核验及回归工具
```

`src/`、`assets/`、网页入口与 Vite 配置是离线构建依赖，必须保留。微信运行包使用独立存储命名空间，私人彩蛋与《欢迎信》《晚安信》由微信构建配置移除。

详细技术沿革见 [`wechat/README.md`](wechat/README.md)。该文件中的历史候选和报告路径用于记录当时事实，历史 `builds/`、`reports/`、迁移副本与研究仓库保留在开发机，不随源码上传。

## 配置与许可

`wechat/local.config.json`、私有开发者工具配置、环境变量文件、密钥、依赖及构建产物均被 Git 忽略。使用模板新建自己的配置即可，不要提交 AppSecret、访问令牌或签名密钥。

第三方字体及引擎许可证保留在相应素材和依赖目录；当前没有新增项目级 `LICENSE`。`CHANGELOG.md` 是继承的历史迁移草稿，不代表微信版已完成平台发布。
