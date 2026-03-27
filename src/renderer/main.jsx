import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

// Sun icon for light mode
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

// Moon icon for dark mode
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

function App() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [imageCounter, setImageCounter] = useState(0);
  const [status, setStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('quicknote-theme');
    return saved || 'light';
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const textareaRef = useRef(null);

  // Check maximized state (event-driven)
  useEffect(() => {
    if (window.api?.onMaximizedChange) {
      window.api.onMaximizedChange((isMaximized) => {
        setIsMaximized(isMaximized);
      });
    }
  }, []);

  // Placeholder pattern for images
  const getPlaceholder = (id) => `[📎 图片${id}]`;

  // Theme effect - apply to document and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('quicknote-theme', theme);
  }, [theme]);

  // Toggle theme handler
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Window control handlers
  const handleClose = () => {
    window.api?.closeWindow();
  };

  const handleMinimize = () => {
    window.api?.minimizeWindow();
  };

  const handleMaximize = async () => {
    window.api?.maximizeWindow();
    if (window.api?.isMaximized) {
      const maximized = await window.api.isMaximized();
      setIsMaximized(maximized);
    }
  };

  useEffect(() => {
    // 自动聚焦到输入框（延迟一下确保 DOM 渲染完成）
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 窗口显示时也聚焦
  useEffect(() => {
    if (window.api?.onWindowShown) {
      window.api.onWindowShown(() => {
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSave();
      }
    };

    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await insertImageFromClipboard(file);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [content, images]);

  // Sync images array when content changes (remove deleted image placeholders)
  useEffect(() => {
    const placeholderIds = images.map(img => img.id);
    const usedIds = new Set();

    for (const img of images) {
      if (content.includes(getPlaceholder(img.id))) {
        usedIds.add(img.id);
      }
    }

    // Remove images whose placeholders were deleted
    const newImages = images.filter(img => usedIds.has(img.id));
    if (newImages.length !== images.length) {
      setImages(newImages);
    }
  }, [content]);

  const insertImageFromClipboard = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const id = imageCounter + 1;
        setImageCounter(id);

        // Insert placeholder into textarea
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const placeholder = getPlaceholder(id);
          const newContent = content.substring(0, start) + placeholder + content.substring(end);
          setContent(newContent);

          // Store image data
          setImages(prev => [...prev, { id, dataUrl }]);

          // Move cursor after placeholder
          setTimeout(() => {
            textarea.focus();
            const newPos = start + placeholder.length;
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id) => {
    // Remove placeholder from content
    const placeholder = getPlaceholder(id);
    setContent(prev => prev.replace(placeholder, ''));
    // Remove from images array (useEffect will handle sync)
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSave = async () => {
    if (!content.trim() || status === '保存中...') return;

    // Replace placeholders with actual image markdown
    let finalContent = content;
    for (const img of images) {
      const placeholder = getPlaceholder(img.id);
      if (finalContent.includes(placeholder)) {
        const markdown = `![图片](${img.dataUrl})`;
        finalContent = finalContent.replace(placeholder, markdown);
      }
    }

    finalContent = finalContent.trim();
    if (!finalContent) return;

    setStatus('保存中...');

    try {
      const result = await window.api.saveToJournal(finalContent);
      if (result.success) {
        setIsSuccess(true);
        setStatus('已保存 ✓');
        setContent('');
        setImages([]);
        setImageCounter(0);
        setTimeout(() => {
          window.api.closeWindow();
        }, 800);
      } else {
        setStatus('保存失败: ' + result.error);
        setIsSuccess(false);
      }
    } catch (err) {
      setStatus('保存失败');
      setIsSuccess(false);
    }
  };

  return (
    <div className="app">
      <div className="header">
        {/* Traffic lights */}
        <div className="traffic-lights">
          <button
            className="traffic-light traffic-close"
            onClick={handleClose}
            title="关闭"
            aria-label="关闭"
          />
          <button
            className="traffic-light traffic-minimize"
            onClick={handleMinimize}
            title="最小化"
            aria-label="最小化"
          />
          <button
            className={`traffic-light traffic-maximize ${isMaximized ? 'maximized' : ''}`}
            onClick={handleMaximize}
            title={isMaximized ? "还原" : "最大化"}
            aria-label={isMaximized ? "还原" : "最大化"}
          />
        </div>

        {/* Spacer for window drag */}
        <div className="header-drag-region" />

        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
          aria-label="切换主题"
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>

      <div className="content">
        <textarea
          ref={textareaRef}
          className="textarea"
          placeholder="输入笔记内容，粘贴图片后按 Cmd+Enter 保存..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={status === '保存中...'}
        />

        {images.length > 0 && (
          <div className="image-preview">
            <div className="preview-header">已添加 {images.length} 张图片</div>
            <div className="preview-grid">
              {images.map((img) => (
                <div key={img.id} className="preview-item">
                  <img src={img.dataUrl} alt="preview" />
                  <button
                    className="preview-remove"
                    onClick={() => removeImage(img.id)}
                    title="移除图片"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <button
          className={`save-btn ${isSuccess ? 'success' : ''}`}
          onClick={handleSave}
          disabled={!content.trim() || status === '保存中...'}
        >
          {status === '保存中...' ? '保存中...' : '保存到日记'}
        </button>
      </div>

      {status && <div className="hint">{status}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
