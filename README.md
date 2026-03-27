# HeptaNote

> 一键保存笔记到 Heptabase 日记，全局快捷键呼出，Cmd+Enter 极速保存。

[![GitHub stars](https://img.shields.io/github/stars/Nar101/heptanote)](https://github.com/Nar101/heptanote)
[![License](https://img.shields.io/github/license/Nar101/heptanote)](https://github.com/Nar101/heptanote)

## 功能特性

- **全局快捷键** `Command/Ctrl + Shift + J` 随时呼出窗口
- **一键保存** 输入内容后 `Cmd/Ctrl + Enter` 立即保存到 Heptabase 今日日记
- **自动隐藏** 保存成功后窗口自动最小化，不打扰工作
- **MCP 加速** 预热 MCP 连接，后续保存更快
- **跨平台** 支持 macOS / Windows / Linux

## 使用前提

- 已安装 [Heptabase](https://heptabase.com/) 并登录账号
- Node.js >= 18

## 安装

### 方式一：下载打包好的 APP（推荐）

前往 [Releases](https://github.com/Nar101/heptanote/releases) 下载对应平台的安装包：

- macOS: `HeptaNote-x.x.x-arm64.dmg` (Apple Silicon) 或 `HeptaNote-x.x.x.dmg` (Intel)
- Windows: `HeptaNote Setup x.x.x.exe`
- Linux: `HeptaNote-x.x.x.AppImage`

下载后双击安装，首次运行可能需要右键→"打开"来绕过 macOS 安全提示。

### 方式二：从源码运行

```bash
# 克隆项目
git clone https://github.com/Nar101/heptanote.git
cd heptanote

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 打包 APP
npm run dist
```

打包后的文件在 `dist/` 目录。

## 使用方法

1. **启动 APP** 后它会在后台运行（菜单栏可见）
2. 按 **Command + Shift + J**（macOS）或 **Ctrl + Shift + J**（Windows/Linux）呼出 HeptaNote 窗口
3. 输入你的笔记内容
4. 按 **Command + Enter**（macOS）或 **Ctrl + Enter**（Windows/Linux）保存
5. 窗口自动隐藏，内容已添加到今日日记

打开 Heptabase → 左侧日记 → 今日日记，即可看到刚才保存的内容。

## 工作原理

```
用户输入内容
    ↓
Electron 主进程收到 IPC
    ↓
通过 MCP (Model Context Protocol) 调用 Heptabase MCP Server
    ↓
append_to_journal tool 写入今日日记
```

首次保存需要完成 OAuth 认证（约 3-5 秒），之后因连接已预热会快很多。

## 项目结构

```
heptanote/
├── src/
│   ├── main/
│   │   ├── index.js          # Electron 主进程
│   │   │                       # - 窗口管理
│   │   │                       # - 全局快捷键注册
│   │   │                       # - MCP 调用逻辑
│   │   │                       # - IPC 处理
│   │   └── preload.js         # 预加载脚本（安全暴露 IPC）
│   └── renderer/
│       ├── index.html         # 入口 HTML
│       ├── main.jsx           # React 入口
│       └── style.css          # 样式
├── dist/                      # 打包输出目录
├── package.json
└── vite.config.js
```

## 技术栈

| 技术 | 用途 |
|------|------|
| [Electron](https://electronjs.org/) | 桌面应用框架 |
| [Vite](https://vitejs.dev/) | 前端构建工具 |
| [React](https://react.dev/) | UI 框架 |
| [MCP SDK](https://modelcontextprotocol.io/) | 调用 Heptabase API |
| [electron-builder](https://www.electron.build/) | APP 打包工具 |

## 配置

### 修改快捷键

编辑 `src/main/index.js` 中的快捷键定义：

```javascript
// 第 277 行
globalShortcut.register('CommandOrControl+Shift+J', () => {
  // 改为你喜欢的快捷键
});
```

### 修改窗口行为

编辑 `src/main/index.js` 中的 `BrowserWindow` 配置（第 214 行）。

## 常见问题

**Q: 提示"MCP not ready"怎么办？**
> 稍等 2-3 秒让 MCP 连接建立完成，然后重试。

**Q: 保存失败怎么排查？**
> 运行 `npm run dev` 打开开发版，控制台会打印 MCP 日志。

**Q: macOS 提示"无法打开"怎么办？**
> 右键点击 APP → 选择"打开" → 弹窗点"打开"。

## 开发相关

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（Vite 热更新 + Electron）
npm run dist         # 打包 APP（输出到 dist/）
npm run dist:dir     # 打包但不生成安装包，只输出目录
```

## License

MIT
