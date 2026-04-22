const { app, BrowserWindow, globalShortcut, ipcMain, clipboard } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { saveToHeptabaseJournalWithOfficialCli } = require('./heptabaseOfficialCli');

let mainWindow = null;
let isQuitting = false;
let captureModeEnabled = false;
let lastClipboardHash = 0;

// Single persistent MCP connection (reused for all saves)
let mcpProcess = null;
let mcpReady = false;
let mcpBuffer = '';
let mcpPending = {};
let mcpCurrentId = 0;

function getNpxPath() {
  try {
    return require('child_process').execSync('which npx').toString().trim();
  } catch (e) {
    return '/usr/local/bin/npx';
  }
}

function getBunPath() {
  try {
    return require('child_process').execSync('which bun').toString().trim();
  } catch (e) {
    return '/Users/nar/.bun/bin/bun';
  }
}

function getHeptabaseCliPath() {
  return path.join(__dirname, '../../node_modules/heptabase-cli/bin/heptabase.js');
}

// Pre-warm: Start MCP connection on app launch
function warmupMcp() {
  if (mcpProcess) return;

  console.log('[MCP] Starting pre-warmed connection...');

  const npxPath = getNpxPath();
  console.log('[MCP] Using npx from:', npxPath);

  mcpProcess = spawn(npxPath, [
    '-y', 'mcp-remote@latest',
    'https://api.heptabase.com/mcp',
    '--transport', 'http-only'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' }
  });

  mcpProcess.stdout.on('data', (data) => {
    mcpBuffer += data.toString();
    const lines = mcpBuffer.split('\n');
    mcpBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleMcpMessage(msg);
      } catch (e) {
        console.log('[MCP] stdout:', line);
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('[MCP] stderr:', data.toString().trim());
  });

  mcpProcess.on('close', (code) => {
    console.log('[MCP] Process closed with code', code);
    mcpProcess = null;
    mcpReady = false;
    // Auto-restart if not quitting
    if (!isQuitting) {
      setTimeout(warmupMcp, 2000);
    }
  });

  mcpProcess.on('error', (err) => {
    console.log('[MCP] Error:', err.message);
    mcpProcess = null;
  });

  // Initialize MCP
  sendMcpRaw({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'quick-note', version: '1.0.0' }
    }
  });

  setTimeout(() => {
    sendMcpRaw({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    mcpReady = true;
    console.log('[MCP] Ready');
  }, 1000);
}

function sendMcpRaw(req) {
  if (!mcpProcess || mcpProcess.killed) return;
  mcpProcess.stdin.write(JSON.stringify(req) + '\n');
}

function handleMcpMessage(msg) {
  if (msg.id && mcpPending[msg.id]) {
    const pending = mcpPending[msg.id];
    clearTimeout(pending.timeout);
    if (msg.error) {
      pending.resolve({ success: false, error: msg.error.message || 'MCP error' });
    } else {
      pending.resolve({ success: true, result: msg.result });
    }
    delete mcpPending[msg.id];
  }
}

function callMcpTool(toolName, args) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || mcpProcess.killed || !mcpReady) {
      reject(new Error('MCP not ready'));
      return;
    }

    const id = ++mcpCurrentId;
    mcpPending[id] = { resolve, reject };

    sendMcpRaw({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    });

    // Timeout
    mcpPending[id].timeout = setTimeout(() => {
      if (mcpPending[id]) {
        delete mcpPending[id];
        reject(new Error('MCP call timeout'));
      }
    }, 15000);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// [铁律] 禁止修改以下代码 —— 保存到 Heptabase Journal 的核心逻辑
// 包括：MCP 连接、npx/bun 路径获取、fallback 调用方式
// 原因：此段代码经过多次调试才稳定运行，任何未经授权的修改都可能导致保存失败
// ═══════════════════════════════════════════════════════════════════════════════
async function saveToHeptabaseJournal(content) {
  try {
    if (!mcpProcess || !mcpReady) {
      warmupMcp();
      await new Promise(r => setTimeout(r, 2000));
    }

    const result = await callMcpTool('append_to_journal', { content });

    if (result && result.result && result.result.content) {
      const text = result.result.content.find(c => c.type === 'text');
      const responseText = text?.text || '';

      if (responseText.includes('Content appended') || responseText.includes('journal')) {
        return { success: true, result: responseText };
      }
    }

    return { success: true, result: JSON.stringify(result) };
  } catch (error) {
    // Fallback to original method
    return await saveToHeptabaseJournalFallback(content);
  }
}

// [铁律] 禁止修改 —— 直接调用 bun + heptabase-cli 的 fallback 方法
// Original method as fallback
const { exec } = require('child_process');

async function saveToHeptabaseJournalFallback(content) {
  return new Promise((resolve) => {
    const bunPath = getBunPath();
    const cliPath = path.join(__dirname, '../../node_modules/heptabase-cli/bin/heptabase.js');
    const escapedContent = content.replace(/"/g, '\\"');
    const command = `"${bunPath}" "${cliPath}" append-to-journal --content "${escapedContent}"`;

    exec(command, {
      timeout: 15000,
      env: { ...process.env, PATH: '/Users/nar/.bun/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' }
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else if (stdout.includes('Content appended')) {
        resolve({ success: true, result: stdout });
      } else {
        resolve({ success: false, error: stdout || 'Unknown error' });
      }
    });
  });
}

async function saveToJournal(content) {
  const cliResult = await saveToHeptabaseJournalWithOfficialCli(content);
  if (cliResult.success) {
    return cliResult;
  }

  console.log('[Official CLI] Save failed, falling back to legacy path:', cliResult.error);
  const legacyResult = await saveToHeptabaseJournal(content);
  if (!legacyResult.success) {
    return {
      success: false,
      error: `Official CLI: ${cliResult.error}; Legacy fallback: ${legacyResult.error}`,
    };
  }
  return legacyResult;
}

const isDev = process.env.VITE_DEV_SERVER_URL;
const configPath = path.join(app.getPath('userData'), 'window-config.json');

function loadWindowConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return { width: 420, height: 360 };
}

function saveWindowConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config));
  } catch (e) {}
}

function createWindow() {
  const config = loadWindowConfig();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: config.width || 420,
    height: config.height || 360,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    backgroundColor: '#FAFAF8',
    title: 'QuickNote',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  // Keep the quick note window available across macOS Spaces and fullscreen apps.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  console.log('[QuickNote] Loading URL:', isDev ? isDev : 'file');
  if (isDev) {
    mainWindow.loadURL(isDev);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.log('[QuickNote] Failed to load:', errorCode, errorDesc);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[QuickNote] Finished loading');
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('[Renderer Console]', message);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[QuickNote] Ready to show');
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [width, height] = mainWindow.getSize();
      saveWindowConfig({ width, height });
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-changed', false);
  });

  mainWindow.on('show', () => {
    mainWindow.webContents.send('window-shown');
  });
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+J', () => {
    createWindow();
  });
}

function setupIPC() {
  ipcMain.handle('save-to-journal', async (event, content) => {
    return await saveToJournal(content);
  });

  ipcMain.on('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  // Window control handlers for custom traffic lights
  ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized();
    }
    return false;
  });

  ipcMain.on('window-maximized-subscribe', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      event.sender.send('window-maximized-changed', mainWindow.isMaximized());
    }
  });

  ipcMain.on('set-capture-mode', (event, enabled) => {
    captureModeEnabled = Boolean(enabled);
    if (captureModeEnabled) {
      lastClipboardHash = getCurrentClipboardHash();
    }
  });
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

function getCurrentClipboardHash() {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    return hashString(image.toDataURL().slice(0, 100));
  }
  return hashString(clipboard.readText() || '');
}

function startClipboardMonitor() {
  setInterval(() => {
    if (!captureModeEnabled || !mainWindow || mainWindow.isDestroyed()) return;

    const currentText = clipboard.readText();
    const currentTextHash = hashString(currentText || '');
    if (currentText && currentTextHash !== lastClipboardHash) {
      lastClipboardHash = currentTextHash;
      mainWindow.webContents.send('clipboard-captured', { type: 'text', content: currentText });
      return;
    }

    const currentImage = clipboard.readImage();
    if (!currentImage.isEmpty()) {
      const dataUrl = currentImage.toDataURL();
      const imageHash = hashString(dataUrl.slice(0, 100));
      if (imageHash !== lastClipboardHash) {
        lastClipboardHash = imageHash;
        mainWindow.webContents.send('clipboard-captured', { type: 'image', content: dataUrl });
      }
    }
  }, 300);
}

app.whenReady().then(() => {
  registerShortcuts();
  setupIPC();
  startClipboardMonitor();
  // 启动时自动显示窗口（仅开发调试用）
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  isQuitting = true;
});
