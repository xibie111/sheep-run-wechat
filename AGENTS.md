# 小羊快跑：微信小游戏独立工程

- 本目录只维护微信小游戏；Android 工程位于 `D:/DSH workspace/sheep-run`，不在此编译或同步 APK。
- 编码、审查与修复遵循 `C:/Users/mechrevo/.codex/skills/karpathy-guidelines/SKILL.md`，保持改动精确并记录实际验证。
- `src/`、`assets/` 和网页入口是本工程独立复制的游戏源码与离线纹理准备依赖，不引用原 Android 目录。
- 主构建命令为 `npm run wechat:build`，验证命令为 `npm run wechat:test`、`npm run wechat:typecheck` 和 `npm run wechat:verify`。
- `npm run build` 是小游戏构建所需的离线网页准备步骤，不能将其成功描述为微信平台或真机通过。
- 配置仅使用本项目自己的 AppID、合法素材域名和本地配置；不记录或发布凭据。
- 保留原玩法、存储隔离、购买规则和触摸行为；浏览器 facade、合成 host、微信工具及真机证据分别记录。
- 每次验收使用独立报告目录；保留历史报告和对应候选，不把旧路径或旧 hash 当作当前目录的验证结果。
