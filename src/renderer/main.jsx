import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // [{id, dataUrl}]
  const [imageCounter, setImageCounter] = useState(0);
  const [status, setStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const textareaRef = useRef(null);

  // Placeholder pattern for images
  const getPlaceholder = (id) => `[📎 图片${id}]`;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

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
