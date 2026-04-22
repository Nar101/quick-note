import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
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

// Copy/capture icon
const CaptureIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function App() {
  const [images, setImages] = useState([]);
  const [imageCounter, setImageCounter] = useState(0);
  const [status, setStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('quicknote-theme');
    return saved || 'light';
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [captureMode, setCaptureMode] = useState(() => {
    const saved = localStorage.getItem('quicknote-capture');
    return saved !== 'false';
  });

  const getPlaceholder = (id) => `[📎 图片${id}]`;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Placeholder.configure({
        placeholder: '输入笔记内容，粘贴图片后按 Cmd+Enter 保存...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          handleSave();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setHasContent(editor.getText().trim().length > 0);
    },
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('quicknote-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (window.api?.onMaximizedChange) {
      window.api.onMaximizedChange((isMax) => {
        setIsMaximized(isMax);
      });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      editor?.commands.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [editor]);

  useEffect(() => {
    if (window.api?.onWindowShown) {
      window.api.onWindowShown(() => {
        setTimeout(() => {
          editor?.commands.focus();
        }, 100);
      });
    }
  }, [editor]);

  useEffect(() => {
    if (!captureMode) return;

    window.api?.setCaptureMode(true);
    window.api?.onClipboardCapture((data) => {
      if (!editor) return;

      const { doc } = editor.state;
      const endPos = doc.content.size;

      if (data.type === 'text') {
        editor.chain().focus().setTextSelection(endPos).insertContent(data.content + '\n').run();
      } else if (data.type === 'image') {
        setImageCounter(prev => {
          const id = prev + 1;
          setImages(currentImages => [...currentImages, { id, dataUrl: data.content }]);
          editor.chain().focus().setTextSelection(endPos).insertContent(getPlaceholder(id) + '\n').run();
          return id;
        });
      }
    });

    return () => {
      window.api?.setCaptureMode(false);
      window.api?.removeClipboardListener();
    };
  }, [captureMode, editor]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleCaptureMode = () => {
    setCaptureMode(prev => {
      const nextValue = !prev;
      localStorage.setItem('quicknote-capture', String(nextValue));
      window.api?.setCaptureMode(nextValue);
      return nextValue;
    });
  };

  const handleClose = () => window.api?.closeWindow();
  const handleMinimize = () => window.api?.minimizeWindow();
  const handleMaximize = async () => {
    window.api?.maximizeWindow();
    if (window.api?.isMaximized) {
      const maximized = await window.api.isMaximized();
      setIsMaximized(maximized);
    }
  };

  const insertImageFromClipboard = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const id = imageCounter + 1;
        setImageCounter(id);
        setImages(prev => [...prev, { id, dataUrl }]);
        editor?.commands.insertContent(getPlaceholder(id));
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id) => {
    const placeholder = getPlaceholder(id);
    if (editor) {
      const { doc } = editor.state;
      doc.descendants((node, pos) => {
        if (node.isText && node.text.includes(placeholder)) {
          editor.commands.deleteRange({ from: pos, to: pos + placeholder.length });
          return false;
        }
        return true;
      });
    }
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const getMarkdownContent = () => {
    if (!editor) return '';
    const html = editor.getHTML();

    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });

    turndown.addRule('listItem', {
      filter: 'li',
      replacement: (content, node) => {
        let indent = '';
        let depth = 0;
        const directParent = node.parentNode;
        let parent = directParent;

        while (parent && parent !== node.ownerDocument) {
          if (parent.tagName === 'UL' || parent.tagName === 'OL') {
            depth++;
          }
          parent = parent.parentNode;
        }

        if (depth > 1) {
          indent = '  '.repeat(depth - 1);
        }

        if (directParent.tagName === 'OL') {
          const index = Array.from(directParent.childNodes).indexOf(node) + 1;
          return `${indent}${index}. ${content.trim()}\n`;
        }

        return `${indent}- ${content.trim()}\n`;
      },
    });

    return turndown.turndown(html).replace(/\n{3,}/g, '\n\n');
  };

  const handleSave = async () => {
    const markdownContent = getMarkdownContent();
    if (!markdownContent.trim() || status === '保存中...') return;

    let finalContent = markdownContent;
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
        setShowStatus(true);
        editor?.commands.clearContent();
        setImages([]);
        setImageCounter(0);
        setHasContent(false);
        setTimeout(() => {
          setShowStatus(false);
          window.api.closeWindow();
        }, 800);
      } else {
        setStatus('保存失败: ' + result.error);
        setIsSuccess(false);
        setShowStatus(true);
      }
    } catch (err) {
      setStatus('保存失败');
      setIsSuccess(false);
      setShowStatus(true);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="traffic-lights">
          <button className="traffic-light traffic-close" onClick={handleClose} title="关闭" aria-label="关闭" />
          <button className="traffic-light traffic-minimize" onClick={handleMinimize} title="最小化" aria-label="最小化" />
          <button className={`traffic-light traffic-maximize ${isMaximized ? 'maximized' : ''}`} onClick={handleMaximize} title={isMaximized ? '还原' : '最大化'} aria-label={isMaximized ? '还原' : '最大化'} />
        </div>

        <div className="header-drag-region" />

        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'} aria-label="切换主题">
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>

        <button className={`capture-toggle ${captureMode ? 'active' : ''}`} onClick={toggleCaptureMode} title={captureMode ? '关闭复制摘录' : '开启复制摘录'} aria-label="复制摘录">
          <CaptureIcon />
        </button>
      </div>

      <div className="content">
        <div
          className="editor-wrapper"
          onClick={() => editor?.commands.focus()}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
              if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                  insertImageFromClipboard(file);
                }
                return;
              }
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {images.length > 0 && (
          <div className="image-preview">
            <div className="preview-header">已添加 {images.length} 张图片</div>
            <div className="preview-grid">
              {images.map((img) => (
                <div key={img.id} className="preview-item">
                  <img src={img.dataUrl} alt="preview" />
                  <button className="preview-remove" onClick={() => removeImage(img.id)} title="移除图片">×</button>
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
          disabled={!hasContent || status === '保存中...'}
        >
          {status === '保存中...' ? '保存中...' : '保存到日记'}
        </button>
      </div>

      {showStatus && <div className={`hint ${isSuccess ? 'success' : ''}`}>{status}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
