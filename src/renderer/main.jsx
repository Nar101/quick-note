import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content]);

  const handleSave = async () => {
    if (!content.trim() || status === '保存中...') return;

    const textToSave = content.trim();
    setStatus('保存中...');

    try {
      const result = await window.api.saveToJournal(textToSave);
      if (result.success) {
        setIsSuccess(true);
        setStatus('已保存 ✓');
        setContent('');
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
          placeholder="输入笔记内容，按 Cmd+Enter 保存..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={status === '保存中...'}
        />
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
