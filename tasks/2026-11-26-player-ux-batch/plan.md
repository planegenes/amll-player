# 播放器体验改进批次（2026-11-26）

- 基线：`origin/main` @ `3111ecef`（个人仓库 `planegenes/amll-player`）
- 工作区：`D:\Github\amll-fork\build`（amll-player 的 git worktree）
- 分支：`feat/ux-batch-improvements`
- 提交约定：每个条目一个提交（第 3 项按 3.1~3.4 各一个提交），提交信息遵循 Conventional Commits

## 总览

| # | 任务 | 状态 | 提交 |
|---|------|------|------|
| 1 | 「播放完毕后暂停」重启/F5 后失效 | 已完成 | `fix(player): …` |
| 2 | GitHub Action 仅构建 Windows x64（其余注释保留） | 已完成 | `ci(player): …` |
| 3.1 | 当前播放列表：播放状态图标改为动态声纹 | 已完成 | `feat(player): …` |
| 3.2 | 当前播放列表：条目尺寸溢出导致 hover 阴影重叠 | 已完成 | `fix(player): …` |
| 3.3 | 当前播放列表：上移/下移一格按钮（边缘禁用） | 已完成 | `feat(player): …` |
| 3.4 | 当前播放列表：点击外部区域自动收起 | 已完成 | `feat(player): …` |
| 4 | 歌单歌曲菜单：插入到当前播放列表 / 下一首播放 | 已完成 | `feat(player): …` |
| 5 | 设置：歌词作者/创作者显示名称可自定义 | 已完成 | `feat(player): …` |
| 6 | 设置：播放控制组件类型拆成上下两个子项 | 已跳过（见下） | — |
| 7 | 音质检测：新增广义标准 Hi-Res 档 | 已完成 | `feat(player): …` |
| 8 | 追加：当前播放列表支持同一首歌重复出现 | 已完成 | `feat(player): …` |

---

## 1. 「播放完毕后暂停」重启/F5 后失效

**现象**：开启「播放完毕后暂停」后，只有本次会话里手动切换过一次开关才生效；重启应用或刷新页面后又变回「不生效」。

**根因**：`pauseAfterPlayEndAtom` 用 `atomWithStorage` 声明时没有开启 `getOnInit`。jotai 的 `atomWithStorage` 默认 `getOnInit: false`，在没有任何组件订阅该 atom 之前，读取到的永远是初始值 `false`。队列管理器（`PlayQueueManager.advanceForAutoEnd`）通过 `store.get(pauseAfterPlayEndAtom)` 读取设置，此时设置页并未挂载、无人订阅，于是拿到 `false`；而手动切换过一次开关后，`SwitchSettings` 订阅了这个 atom，值才与 localStorage 同步，所以只在「手动开过一次之后」生效。

**方案**：给 `pauseAfterPlayEndAtom` 补上 `{ getOnInit: true }`，与 `persistedQueueStateAtom` 的写法保持一致。

**涉及文件**：`packages/player/src/states/appAtoms.ts`

**验证**：设置页打开「播放完毕后暂停」→ 关闭应用重启 / F5 刷新 → 播放一首歌到结束，应停在末尾并暂停，而不是切到下一首。

---

## 2. GitHub Action 仅构建 Windows x64

**现状**：`.github/workflows/build-player.yaml` 一个工作流里包含桌面矩阵（linux x64、windows x64、windows arm64、macOS arm64、macOS x64）+ Android + iOS 三个 job。

**方案**：
- `build-tauri-desktop` 的 `matrix.include` 只保留 `windows-x64`，`windows-arm64` 与其余平台条目一律用 YAML 注释保留并注明如何恢复；
- Android、iOS 两个 job 整体注释保留（它们只 `needs: clean-pre-release`，注释后不影响其他 job）；
- 文件头补一段说明注释。原有的 macOS/Linux 条件步骤保持原样（在只跑 Windows 时自然跳过），便于日后一次性取消注释即可恢复多端构建。

**涉及文件**：`.github/workflows/build-player.yaml`

**验证**：推送后 Actions 只出现「构建 Tauri 桌面版本」中的一个 Windows x64 矩阵任务与「删除预发布版本」；本地可用 `actionlint` 或 GitHub 上的 workflow 语法校验。

---

## 3.1 当前播放列表：播放状态图标改为动态声纹

**现状**：当前歌曲用 `<PlayIcon />` 标记（`components/NowPlaylistCard`），与「点击播放」语义混淆。

**方案**：新增 `PlayingWaveformIndicator`：4 根竖条，播放中用 CSS 动画做声纹跳动；暂停时不做动画（静态声纹，保留「是当前歌曲」的指示）。动画用纯 CSS `@keyframes`，不引入新依赖；`prefers-reduced-motion: reduce` 时退化为静态。

**涉及文件**：`components/NowPlaylistCard/index.tsx`、`components/NowPlaylistCard/index.module.css`

**验证**：播放中当前条目显示跳动声纹；暂停后图标静止；系统开启「减少动态效果」时始终静止。

---

## 3.2 当前播放列表：条目尺寸溢出导致 hover 阴影重叠

**现状**：外层 `PlaylistSongItem` 高度固定为 `calc(var(--space-2) * 2 + 50px)`，内部 `.songButton` 又带 `padding: var(--space-2) …` 且 `height: 100%`，`box-sizing: border-box` 只作用于自身，导致内部内容实际高度超过容器；hover 背景/阴影相互挤压重叠。

**方案**：
- 容器不再自己算高度，改为让按钮内部 padding 撑开高度（去掉固定 `height`，改用 `min-height` + 内部 padding 一致）；
- 统一 `box-sizing: border-box`，保证条目高度 = 内部按钮高度，相邻条目 hover 时不重叠；
- 虚拟列表 `estimateSize` 与真实行高保持一致（提取成常量）。

**涉及文件**：`components/NowPlaylistCard/index.module.css`、`components/NowPlaylistCard/index.tsx`

**验证**：鼠标在相邻条目间移动时，hover 背景块之间有明显间距、不重叠；列表滚动无抖动。

---

## 3.3 当前播放列表：上移/下移一格

**方案**：
- `PlayQueueManager` 新增 `moveSong(fromIndex, toIndex)`：在 `playList` 中移动，非随机模式下同步移动 `originalList`，并修正 `currentIndex`；
- 条目右侧新增上移/下移两个 `IconButton`，首/末条分别只禁用不禁用隐藏（`disabled`）；
- 新增 i18n 文案。

**涉及文件**：`utils/play-queue-manager.ts`、`components/NowPlaylistCard/index.tsx`、`components/NowPlaylistCard/index.module.css`、`locales/*/translation.json`

**验证**：中间条目可上下移动；第一条的上移与最后一条的下移按钮置灰不可点；移动当前歌曲时高亮跟随歌曲本体。

---

## 3.4 当前播放列表：点击外部自动收起

**方案**：`NowPlaylistCard` 内用 `pointerdown` 监听文档，命中卡片外部时调用 `onClose`；播放栏的列表按钮加 `data-amll-playlist-toggle` 标记并在判定中排除，避免「刚点开就被关闭又立刻打开」。

**涉及文件**：`components/NowPlaylistCard/index.tsx`、`components/NowPlayingBar/index.tsx`

**验证**：点击列表外任意位置收起；点击播放栏的列表按钮仍可正常开/关。

---

## 4. 歌单歌曲菜单：插入到当前播放列表 / 下一首播放

**现状**：歌单条目「更多」菜单只有「播放音乐」「编辑歌曲覆盖信息」「从歌单中删除」。

**方案**：
- 在「播放音乐」与「编辑歌曲覆盖信息」之间插入两项：
  - 「插入到当前播放列表」→ 队尾（复用 `PlayQueueManager.addToQueue`，队列为空时直接加入）；
  - 「下一首播放」→ 当前歌曲之后（新增 `insertNextToPlay`，队列为空时直接加入）。
- 两个方法都对已在队列中的歌曲去重（与现有 `addToQueue` 行为一致）。

**涉及文件**：`components/PlaylistSongCard/index.tsx`、`utils/play-queue-manager.ts`、`locales/*/translation.json`

**验证**：在歌单里对任意歌曲点这两项，当前播放列表中出现对应位置；播放列表为空时点任一项会把歌曲加进空列表。

---

## 5. 设置：歌词作者 / 创作者 显示名称可自定义

**现状**：歌词底部信息固定渲染 `bottom_lyric.lyricAuthor`（「歌词作者：」）与 `bottom_lyric.songWriter`（「创作者：」）。

**方案**：
- 新增两个持久化 atom：`bottomLyricAuthorLabelAtom`、`bottomLyricWriterLabelAtom`，默认值分别为「歌词作者」「创作者」；
- 设置 → 歌词内容 → 底部信息 下方新增两个输入框（`TextField.Root`），留空时回退到默认值；
- `BottomLyricInfo` 用这两个 atom 的文本作为键名，冒号仍走既有分隔文案。

**涉及文件**：`states/appAtoms.ts`、`pages/settings/player.tsx`、`components/BottomLyricInfo/index.tsx`、`locales/*/translation.json`

**验证**：修改两个名称后，歌词页底部信息同步变化；清空后回退默认值。

---

## 6. 设置：播放控制组件类型拆成上下两个子项 —— 跳过

**原因**：进度条 `PrebuiltProgressBar` 是 `@applemusic-like-lyrics/react-full` 0.6.0 的内部私有组件，未导出；`PrebuiltLyricPlayer` 在横/竖布局里硬编码 `歌曲信息 → 进度条 → 播放控件` 的渲染顺序，既无进度区插槽也没有可关闭它的 atom。

对比：现有的「播放控制组件类型」能切到线条音频可视化，是因为库自己导出了 `playerControlsTypeAtom` 并由库内部 `PrebuiltMusicControls` 消费该 atom —— 库只给「下方控件区」留了旋钮。

**结论**：仅改本仓库无法替换进度区。等上游库暴露进度区插槽（或另立方案：复刻本组件 / pnpm patch / 改本地库并在 vendor 流程里应用补丁）后再做。为避免出现无效设置项，本批次不改动该设置。

---

## 7. 音质检测：新增广义标准 Hi-Res 档

**现状**：无损编码（flac/alac/ape/wav/aiff）且 `采样率 ≥ 96kHz 且 位深 ≥ 24bit` → 「高解析度无损」，其余无损 → 「无损」。

**方案**：按 JAS/CEA 广义标准新增一档：
- `采样率 ≥ 48kHz 或 位深 > 16bit`（且为无损编码）→ 新标签「Hi-Res 无损」；
- `采样率 ≥ 96kHz 且 位深 ≥ 24bit` 仍为「高解析度无损」；
- 其余无损仍为「无损」。

实现放在 `LocalMusicContext` 内的音质分级辅助函数中，标签渲染与 `AudioQualityType` 判定共用同一套规则，避免两处口径不一致。

**涉及文件**：`components/LocalMusicContext/index.tsx`、`locales/*/translation.json`

**验证**：分别用 44.1kHz/16bit、48kHz/16bit、44.1kHz/24bit、96kHz/24bit 的无损文件测试，标签依次为「无损」「Hi-Res 无损」「Hi-Res 无损」「高解析度无损」。

---

## 8. 追加：当前播放列表支持同一首歌重复出现

**现状**：`addToQueue` 与 `insertNextToPlay` 都会先判断「队列里是否已有同 id 歌曲」并静默跳过；
删除、移动、随机切换的定位也全部依赖 `songId` 在队列中唯一。

**方案**：
- `addToQueue` / `insertNextToPlay` 去掉去重，同一首歌可重复入队；
- 新增 `removeAt(index)` 按位置只移除当前这一份，队列面板的删除按钮改用它；
- `removeSong(songId)` 保留但语义改为「移除该歌曲的所有副本」，供「从歌单删歌同步队列」使用；
- `toggleShuffle` 改用「同 id 的第 n 次出现」定位当前歌曲，重复项也能正确跟随；
- 新增 `findOriginalIndex()` 把 `playList` 下标映射到 `originalList`，`removeAt` 在随机模式下据此同步；
- `insertNextToPlay` 在非随机模式下改为两个列表同位置插入，维持「非随机时两列表同序」的不变量。

**不变量**：`shuffleActive === false` 时 `playList` 与 `originalList` 顺序一致（`addToQueue`、
`insertNextToPlay`、`moveSong`、`setQueue`、`toggleShuffle` 均维持该约束）。

**影响面**：`gitnexus_impact` 提示 `toggleShuffle` 为 HIGH（3 个直接调用方、
影响 `LocalMusicContext` 播放流程），但改动仅限「找回当前歌曲的方式」，签名与随机重建逻辑不变，
无重复项的队列行为与之前一致。

**涉及文件**：`utils/play-queue-manager.ts`、`components/NowPlaylistCard/index.tsx`

**验证**：同一首歌连续点两次「插入到当前播放列表」→ 队列出现两条；分别删除其中之一 → 只少了对应那一份；
上移/下移重复项 → 位置正确；开启/关闭随机播放 → 当前播放指示不漂移；
从歌单删除该歌曲 → 队列中所有副本一并移除。

---

## 验证清单（本机用 PowerShell 执行）

```powershell
cd D:\Github\amll-fork\build
pnpm install
pnpm typecheck
pnpm biome check packages/player/src
cd packages\player
pnpm tauri dev
```

> 说明：本轮改动涉及 Rust 侧无改动，无需 `cargo` 重新编译；`player-core` 未触碰。
