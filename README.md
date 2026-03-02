# 看点

沉浸式视频/图片流应用，支持 Web 与 Tauri 多端（macOS、iOS、Android）。

## 当前能力

- 视频流浏览：上下滑切换、自动播放、键盘/滚轮操作、切换过渡动效
- 图片流浏览：独立模式切换、上下滑切换
- 预加载：视频/图片多条预取，降低切换等待
- 缓冲反馈：底部进度条呼吸动效（不再整页 loading）
- 收藏系统：双击点赞收藏，收藏面板预览与删除
- 下载能力：
  - Web：浏览器下载
  - 桌面 Tauri：直接写入用户 `Downloads`
  - 移动端：通过系统分享面板保存到相册
- 音频策略：`Web` 默认静音，`App`（Tauri）默认有声
- PWA：`manifest + service worker` 基础能力

## 技术栈

- 前端：Svelte 5 + Vite
- 样式：全局 CSS + Tailwind（保留）
- 跨端：Tauri 2
- 本地存储：localStorage

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) Web 开发

```bash
npm run dev
```

### 3) Web 构建

```bash
npm run build:web
```

### 4) 本地预览构建产物

```bash
npm run preview
```

### 5) 类型与静态检查

```bash
npm run check
```

## 多端命令

### Desktop（Tauri）

```bash
npm run tauri:dev
npm run tauri:build
```

### iOS（Tauri）

```bash
npm run tauri:ios:init
npm run tauri:ios:dev
npm run tauri:ios:build
```

iOS 真机打包前需要配置签名 Team ID（否则会报 `xcodebuild code 65`）：

```bash
export APPLE_DEVELOPMENT_TEAM=你的TeamID
```

或写入 `src-tauri/tauri.conf.json` 的 `bundle.iOS.developmentTeam`。

### Android（Tauri）

```bash
npm run tauri:android:init
npm run tauri:android:dev
npm run tauri:android:build
```

### 一键构建脚本（推荐）

```bash
# 交互选择平台（Space 多选，Enter 构建）
npm run build:app

# 或直接指定目标
bash scripts/build-app.sh web
bash scripts/build-app.sh desktop
bash scripts/build-app.sh ios
bash scripts/build-app.sh ios-sim
bash scripts/build-app.sh android
bash scripts/build-app.sh teamid
bash scripts/build-app.sh all
bash scripts/build-app.sh web ios
```

`build:app` 在 iOS 构建时会自动探测 Team ID（环境变量 -> tauri.conf -> Xcode 工程），并自动带入构建。
若未探测到有效 Team ID，会在终端内直接提示输入，随后自动写入 `src-tauri/tauri.conf.json` 再继续构建。
同时会自动关闭 Xcode 的 `ENABLE_USER_SCRIPT_SANDBOXING`，避免 `Operation not permitted` 导致的 Rust 构建失败。

可单独执行：

```bash
bash scripts/build-app.sh teamid
```

用于查看 Team ID 探测来源与最终使用值。

`ios-sim` 用于无签名模拟器构建，脚本会使用占位 Team（`SIMULATR00`）通过 Tauri 前置检查；真机包仍必须设置真实 Team ID。

### 一键部署 Vercel

```bash
# 首次会引导 vercel login / vercel link
npm run deploy:vercel

# 预览环境部署
npm run deploy:vercel:preview
```

脚本位置：`scripts/deploy-vercel.sh`  
支持 `VERCEL_TOKEN`（CI 无交互部署），也支持通过 `VERCEL_ORG_ID + VERCEL_PROJECT_ID` 直接写入 `.vercel/project.json`。  
脚本默认使用 `vercel deploy --archive=tgz`，避免大仓库上传文件数超限。

### GitHub Actions 自动构建发布

推送 `main` 会触发 `.github/workflows/build-release.yml`：

- `build-ios`：构建 unsigned IPA（供后续自签）
- `build-android`：构建 Android APK/AAB
- `build-desktop`：构建 macOS DMG
- `release`：自动创建 GitHub Release，上传产物并附带构建日志与 SHA256 校验信息

## 交互快捷键（桌面）

- `↑ / ←`：上一条
- `↓ / →`：下一条
- `滚轮`：上下切换
- `Space`：播放/暂停（视频）
- `L`：点赞/收藏
- `M`：静音切换（视频）
- `D`：下载当前媒体

## 配置入口

- 前端核心逻辑：`src/features/kandian/bootstrap.js`
- 业务参数（预加载/手势阈值/重试等）：`src/features/kandian/constants.js`
- 全局样式：`src/app.css`
- Tauri 窗口与打包：`src-tauri/tauri.conf.json`
- Capacitor 名称配置：`capacitor.config.json`

## 项目结构

```text
.
├── src/
│   ├── components/               # 页面结构组件
│   ├── features/kandian/         # 主业务（bootstrap + services + constants）
│   ├── app.css                   # 全局样式与动效
│   └── App.svelte
├── public/
│   ├── manifest.webmanifest
│   └── sw-pwa.js
├── src-tauri/                    # Tauri 原生层
├── index.html
├── server.js
└── package.json
```

## 图标更新

已提供图标母版：

- `src-tauri/icons/kandian-icon.svg`

如需重新生成各平台图标：

```bash
npx tauri icon src-tauri/icons/kandian-icon.svg
```
