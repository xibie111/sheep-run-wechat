# 微信小游戏完整版迁移（平台待验收）

2026-10-19 本轮继续迁移已完成代码增量与非真机回归：普通跑酷只加载已选/已解锁皮肤，衣橱全部预览和伙伴规则保留。1657项测试、64项微信专项、类型与完整pipeline PASS；LOCAL WebGL180秒32星、Canvas65秒8星，11章入口/9居民信及全部收藏明信片均通过（解锁/余额/收藏夹具明确标识）。微信工具当前构建确认默认Run新请求18图/额外皮肤0，简洁窗口65秒2385帧；完整窗口初次automator超时后同句柄恢复，原场景和后续65秒UI区间通过，未宣称旧停滞根因修复。当前候选 builds/wechat-20261019-owned-skins。完整混合包实际HTTPS联调仍缺自有assetBaseUrl，工具实际包体及原生自然长跑/拾取尚未通过；真机已按用户指示SKIPPED_USER_REQUEST，不是继续开发的门槛。报告 reports/wechat-full/20261019-100819-continue-migration/REPORT.md。没有提交、推送、上传发布、APK、Android同步或升版本。下文在执行/旧候选等属于各自历史时点。

2026-10-19 补验：当前混合候选为 `builds/wechat-20261019-trip-text`；新 WebGL/Canvas 全本地诊断包均实际通过自然碰撞结算、旅行入口字形与点击复测。已修复“查看这次旅行”文字压住背景书本的问题；保留字库、美术与原按钮行为。baseline 的原生三手势、暂停/继续/重开、微信独立键关闭重入读回及音频设置分项新增证据另按 buildId 记录。修复后 1654 项/61 项测试、类型、网页准备、微信 pipeline 和严格来源核验通过。完整平台验收未完成：HTTPS、实际拾取防重复、自然长跑、系统生命周期、真机与工具包体仍未通过；旧停滞未声称修复。完整报告：`reports/wechat-full/20261019-002919-resume/REPORT.md`。以下 2026-10-17 及更早段落是历史状态，不是当前候选。

2026-10-17补充：R15同源简洁窗口完成18个稳定界面状态的微信工具文字检查，另存1次过渡观测，0边界问题；65秒界面观测1744帧，最大帧间隔451.5ms，无错误。人工得分/结算已按用户说明归为手动试玩，不列为自动跳转异常或自动拾取证明。原完整窗口停滞FAIL未证实修复；重开后的自动化超时、HTTPS与真机仍未验。独立报告：reports/wechat-full/20261017-1639-loop-diagnostic/REPORT.md。待托管素材仅使用builds/wechat-full-text-r15-assets-20261017-1800/（或同名zip）的106张PNG及原textures/路径；共用remote目录是历史缓存，不宜整体托管。没有上传。

2026-10-17文字修复后的当前候选为 `builds/wechat-full-text-r15/`；完整本地诊断包为 `builds/wechat-full-text-local-r15/`，后者预算检测仍FAIL。加载进度改为原字库的Phaser同帧绘字，调整居民/送信面板的紧凑高度间距。1654项测试、61项微信测试、两端类型、网页准备/微信pipeline及四组合1128次LOCAL界面状态检查通过。R15原生加载文字截图通过，但随后再次出现原有>5秒主循环停滞，完整平台状态仍FAIL。报告：`reports/wechat-full/20261017-1305-text-overlap/REPORT.md`。以下R8/R9段落保留各自历史时点，不是当前候选或当前来源一致性结论。

> 2026-10-16 工程拆分：当前独立根目录为 `D:/codex workspace/sheep-run-wechat`，本目录不包含 Android 工程。`src/`、`assets/` 和网页入口是本地独立的离线纹理准备依赖；以下历史报告中的原路径保持当时事实。当前构建以本目录新生成的来源清单和哈希为准。

当前入口复用原 MenuScene、WardrobeScene、RunScene、PauseScene、ResultScene 和全部内容系统，保留 Phaser 4.2.1、480×270 基准、原自适应、触摸/物理/购买/奖励规则和 Dash 默认关闭。原网页与 Android 路径保留。

用户已确认微信版删除全部私人彩蛋与《欢迎信》《晚安信》；正式送信章节及居民来信保留。当前候选为 `builds/wechat-full-no-private-r8/`，已导入并验证新菜单/邮箱。`builds/wechat-full-no-private-local-r8/` 为超限诊断包，原生启动停滞FAIL保留。最新报告见 `reports/wechat-full/20261017-1045-remove-private-content/REPORT.md`；以下R7及更早候选属于历史记录。

后续原生同源R8两次打开资源ready约20.5/20.1秒，5字库与15帧羊、越障/碰撞及318分18金币关闭重开读回通过分项验证；旧启动FAIL未证实修复，单局60秒及真实拾取仍未达成。见 `reports/wechat-full/20261017-1206-native-startup-check/REPORT.md`。413张PNG无损实验仍需约78.55MB（纯PNG）或61.70MB（混合无损WebP）总载荷，未替换生产格式，仍需HTTPS目录；完整证据见 `reports/wechat-full/20261017-1126-lossless-resources/REPORT.md`。

本轮末次新模拟实例又触发主循环>5秒停滞，当前原生结果 **FAIL**，以该报告的 `FINAL-STATUS.json` 为准。后续变化的908分/5星/41金币现场保持原样，不算自动拾取验收；没有清缓存、重启覆盖或屏蔽错误。

R9可见性监听实验虽通过本地测试/构建，却未获得与最小化对应的原生隐藏信号，已精确撤回，生产来源1154项恢复R8一致。`builds/wechat-full-visibility-r9`及`builds/wechat-full-visibility-local-r9`仅保留为冻结实验，不能当作当前修复交付；最终记录见 `reports/wechat-full/20261017-1238-native-visibility/REPORT.md`。完整平台目标仍未完成。

**完整平台验收尚未通过。** 用户自有小游戏测试号已配置，开发者工具Stable2.02.2608080及官方MCP可用；R6已在基础库3.17.4中运行，auto实际WebGL、强制Canvas实际CANVAS。原生分项证据及明确未验项目见 `reports/wechat-full/20261016-2350-native-handoff/REPORT.md`。当前缺自有HTTPS素材域名、真实安卓/iOS微信设备和工具实际包体统计。测试号、模拟器、浏览器和真机结论分别记录。

R7历史可导入候选为 `builds/wechat-full-platform-r7-ready/`，另有超限的 `builds/wechat-full-platform-local-r7/` 仅供诊断；两个包不能相互代替完整通过。R7关闭多余DOM父节点尺寸检测，60帧假resize由3次变0次、40帧UI上传由15次变0次，菜单独立观测约35.24FPS，对应菜单PNG与R6字节相同；这仍不代表性能或真机通过。记录见 `reports/wechat-full/20261017-0051-menu-profile/REPORT.md`。开发工具会改写项目元数据，后续重建应使用新目录，保留已记录候选。R1–R5不能证明首屏；R6一次冷重开出现未定位的navigator错误，失败记录保留，R7后续启动/重开/重新编译未重现。

## 构建与核验

2026-10-17新增原生补验见 `reports/wechat-full/20261017-1000-native-acceptance/REPORT.md`：超限本地诊断包通过欢迎信3页/返回未读、衣橱8页36入口；自然试跑发生碰撞，60秒及真实拾取仍未通过。拆分交接后的1151项运行输入与R7一致，后续仅在本独立目录工作。

```powershell
npm run wechat:test
npm run wechat:typecheck
npm run wechat:build
npm run wechat:verify
```

`wechat:build` 自动重建原网页、提取当前完整纹理/帧/字库/动画，再生成独立小游戏 IIFE，并核验输入和产物。默认输出 `builds/wechat-full/`，另有 `builds/wechat-full-remote/` 原画素材目录；后者不在小游戏工程根目录中。入口 `game.js` 先加载平台桥接，再初始化引擎。以“小游戏”导入整个 `builds/wechat-full/`，不要导入仓库、src 或素材目录。

当前R8混合资源包的磁盘估算为28,850,128 B、主包3,729,647 B；微信工具实际包体未测。完整原画有437纹理键/413张独立PNG，共96,788,657 B，因此保留包内启动资源，其他真实纹理按功能/章节加载。当前106个远程PNG共74,925,268 B，清单与每项SHA见对应 build-manifest.json 的 remoteFiles；只使用当前清单所列文件。没有执行上传或创建托管服务。

复制 `wechat/local.config.example.json` 为被Git忽略的 `wechat/local.config.json`，填写自己的小游戏 AppID 和 `assetBaseUrl`。地址须为自己可使用、已配置平台合法域名的 HTTPS 静态目录，以斜杠结尾，不含凭据或查询参数；保持 `textures/<hash>.png` 路径。托管响应应提供正确PNG类型及允许图片跨域使用的响应头。没有地址时，默认包能显示真实菜单；需要远程资源的入口会明确失败并可返回，不会用占位图继续。

本机 `wechat/local.config.json` 已保留用户自有小游戏测试号，assetBaseUrl仍为空。获取素材地址的步骤见 `reports/wechat-full/20261016-2350-native-handoff/HOW-TO-HOST.md`；没有创建云服务或执行上传。MCP令牌只在连接内存中使用，不属于此文件。官方CLI绝对路径是 `D:/微信web开发者工具/wechatide.cmd`，未修改全局Codex配置。

`renderer` 可选 auto、canvas、webgl。强制模式和实际渲染器不符会报错；auto 根据实际能力选择并记录结果。每个配置产生独立buildId。不要使用第三方AppID，也不要把秘密值写入配置或报告。

```powershell
# 全部真实素材放在本地的开发候选，R8约103.78 MB，超过微信包体限制
npm run wechat:build:local
# 旧PoC仍保留独立构建路径 builds/wechat-poc/
npm run wechat:poc:build
```

本地完整候选仅用于诊断；不能作为满足微信包体限制的交付。原PoC报告和20261015历史记录保留。

## 平台边界

- 可见UI由微信离屏Canvas及Phaser画布绘制，保留原字形、美术与透明度，不依赖可见DOM/CSS。Canvas模式对本项目创建的九宫格对象补充绘制；WebGL继续使用引擎实现。
- 原衣橱36套皮肤、无尽跑酷、章节/居民故事、信件、图鉴/成就、旅行卡等均使用原实现。章节大图、其他皮肤和明信片延迟加载，关闭后释放不用的纹理及关联动画。
- 微信存储使用 `sheep-run-wechat-full-v1/` 加原存储名。第一次仅在完整键缺失时复制此前的 `sheep-run-wechat-save-v1`，保留旧键。网页/安卓与旧PoC存档不读写。格式、读取、写入或读回异常均保留原始数据并阻止不确定写入。
- 即使设置保存失败，音效关闭仍对本次会话生效；健康读回后才同步持久设置。音频使用原cue参数导出的WAV与原完整音乐，后台停止，回前台需新触摸继续。设备可听性尚未验证。
- 沿用单一Phaser TimeStep和原Arcade物理；没有额外驱动循环。暂停、后台、取消和第二根手指均通过原触摸所有权处理。错误明确记录，不吞掉全部异常。

## 本地回归

```powershell
# 完整本地候选；这是浏览器wx facade，不是微信工具
$env:WECHAT_FULL_PACKAGE='builds/wechat-full-local'
npm run wechat:review
```

设置 `WECHAT_FULL_FAILURES=1` 补资源失败重试，`WECHAT_FULL_CHAPTERS=1` 补全部章节入口，`WECHAT_FULL_ROUTE=1` 跑自然送信，`WECHAT_FULL_LONG=1` 跑65秒触摸机器人。购买余额、已完成章节、收藏等测试夹具均在隔离浏览器内明确标记，不作为真实玩家进度或自然通关证明。

`WECHAT_FULL_LONG_MS`可指定65000—600000毫秒观察时长；本轮实际完成180秒。`WECHAT_FULL_WIDTH`、`WECHAT_FULL_HEIGHT`和`WECHAT_FULL_DPR`只控制本地触摸测试窗口，不改变游戏参数。最终auto/Canvas/WebGL候选及DPR1/2/3、800×600比例记录见本轮REPORT。

无浏览器DOM的补充检查使用`node tools/wechat-full-host-review.mjs`，默认读取全本地诊断包，在独立V8中仅提供wx模拟接口和真实Skia Canvas。它需要本机已有的`@napi-rs/canvas`，不会安装依赖。菜单、衣橱、中文信件、暂停/取消/后台及文件系统加载均独立检查；`WECHAT_FULL_HOST_LONG=1`增加65秒触摸机器人和时间推进断言。合成宿主功能通过不能证明微信或性能通过，任何长跑失败须保留。

`WECHAT_FULL_HOST_CLOCK=wx`移除合成全局performance，检查官方微信微秒时钟转毫秒的条件分支；已有原生performance不会替换。当前宿主补丁还补齐缺失screen及桥接矩形的toJSON，原接口继续保留。

对于未配置素材地址的默认包，只验证缺配置提示：设置 `WECHAT_FULL_MISSING_HOST=1` 后运行 review，并在结束后清除该环境变量。带 `.invalid` 地址的构建仅供本地拦截真实PNG的测试，不能导入后声称远程域名已配置。

完整版历史记录：`reports/wechat-full/20261016-113750-full-migration/`。最新来源与原生兼容证据：`reports/wechat-full/20261017-0051-menu-profile/`；R6完整范围/托管步骤见上一轮native-handoff。源码快照与失败记录保留，旧目录不再反向同步。

开发工具启动、两种renderer的菜单、诊断包三种手势/物理/暂停/重开已取得R7分项证据，存储窗口重开等旧结果按构建分别保留。真实远程加载、拾取防重复、系统取消/后台、多指、单局60秒、真机可听性、内存与实际包体仍待补验。此次没有提交、推送、上传、发布、同步/编译APK或升版本。
