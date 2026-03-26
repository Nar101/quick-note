# hepta-note 项目说明

## 项目背景

这是一个 Heptabase QuickNote 小工具，用于快速保存笔记到 Heptabase 日记。

## 铁律 ⚠️

**禁止修改以下代码** —— 保存到 Heptabase Journal 的核心逻辑

具体位置：`src/main/index.js` 中的以下函数及相关的路径获取逻辑：
- `getNpxPath()` - 动态获取 npx 完整路径
- `getBunPath()` - 动态获取 bun 完整路径
- `warmupMcp()` - MCP 预热连接
- `callMcpTool()` - MCP 工具调用
- `saveToHeptabaseJournal()` - MCP 方式保存
- `saveToHeptabaseJournalFallback()` - fallback 直接调用 bun + heptabase-cli

**原因**：这段代码经过反复调试才稳定运行。核心问题是 Electron 打包后 PATH 环境变量不完整，导致找不到 `npx` 和 `bun`，必须用完整路径 + 显式 PATH 才能解决。任何未经授权的修改都可能导致保存功能彻底失效。

## 技术要点

### 为什么工具路径要动态获取

macOS 上用 `which npx` / `which bun` 动态获取完整路径，而不是硬编码。因为 Electron 应用运行环境的 PATH 变量不完整，直接写 `npx` 或 `bun` 会报 `command not found`。

### 两种保存方式

1. **MCP 方式**（优先）：通过 `mcp-remote` 连接 Heptabase MCP 服务
2. **Fallback 方式**：直接用 `bun` 调用本地 `heptabase-cli` 包

### Fallback 的 PATH 必须包含

```
/Users/nar/.bun/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
```

## 调试技巧

如果保存失败：
1. 先在终端直接运行 fallback 命令测试：`/Users/nar/.bun/bin/bun /path/to/heptabase-cli/bin/heptabase.js append-to-journal --content "test"`
2. 检查 MCP 连接：`lsof -i :22936` 看端口是否被占用
3. 查看日志：`tail -f /tmp/hepta-note-debug.log`（如有调试日志）
