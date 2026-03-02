# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

XJJ（刷视频）— 沉浸式短视频浏览 PWA 应用。纯前端，无框架、无构建工具、无包管理器。

## 技术栈

- 原生 HTML5 / CSS3 / JavaScript (ES6+)
- PWA: manifest.json + Service Worker (sw.js)
- 数据持久化: localStorage (键名 `xjj_likes`)
- 视频 API: `https://api.lolimi.cn/API/xjj/xjj`（返回重定向到 .mp4）

## 开发与部署

**无构建步骤**。直接用静态文件服务器托管即可（需 HTTPS，Service Worker 要求）。

本地开发可用任意静态服务器，例如：
```bash
npx serve .
# 或
python -m http.server 8000
```

**无自动化测试**。通过浏览器 DevTools 手动测试。

## 架构

**单文件应用**：所有逻辑集中在 `index.html`（约 1050 行）。

文件内部结构：
- **1-405 行**: CSS — 变量系统、Safe Area 适配（灵动岛/刘海屏）、玻璃态 UI、动画（breathe/spin/particle-fly/dbl-heart）
- **408-533 行**: HTML — 视频播放舞台(#stage)、侧边操作按钮(#actions)、收藏夹面板(#fav-panel)、底部 Tab 栏(#tab-bar)
- **535-1050 行**: JavaScript — IIFE 包裹，包含以下模块：

### JS 核心模块

| 模块 | 关键函数 | 职责 |
|------|---------|------|
| 视频获取 | `fetchVideoUrl()` | 从 API 获取视频 URL，重试 5 次，验证 Content-Type 和后缀 |
| 播放管理 | `playUrl()`, `goNext()`, `goPrev()` | 淡入淡出切换，维护 history[] 和 currentIdx |
| 预加载 | `preloadVideo()` | 预加载后续 2 个视频到 queue[] |
| 点赞系统 | `toggleLike()`, `doLike()` | Canvas 生成缩略图(135x240, q=0.55)，存入 localStorage |
| 收藏夹 | `renderFavList()` | 3 列网格渲染，桌面端 hover 预览，支持删除 |
| 交互层 | touch/wheel/keyboard 事件 | 上滑下一个、双击点赞+粒子动画、单击暂停、快捷键(↑↓/L/M/Space) |

### 关键数据结构

- `history[]`: 已播放视频 URL 列表
- `currentIdx`: 当前播放索引
- `queue[]`: 预加载视频 URL 队列
- `likes[]` (localStorage): `[{ url: string, thumb: string }, ...]`

### 其他文件

- `sw.js`: Service Worker — 静态资源 Cache-First，API/MP4 Network-First，缓存版本 `xjj-v1`
- `manifest.json`: PWA 配置 — standalone 模式，中文，黑色主题

## 修改注意事项

- 所有 JS 在 IIFE 内，无全局变量泄漏
- CSS 使用 `env(safe-area-inset-*)` 适配异形屏，修改布局时需保留
- `-webkit-backdrop-filter` 用于 Safari 兼容，不可省略
- 视频 API 返回重定向 URL，`fetchVideoUrl` 中有内容类型和后缀双重验证逻辑
- Service Worker 缓存版本号在 `sw.js` 顶部的 `CACHE` 常量中
