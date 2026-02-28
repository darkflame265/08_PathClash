import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getSocket } from '../../socket/socketClient';
import './ChatPanel.css';

export function ChatPanel() {
  const { messages } = useGameStore();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Tab key to focus/unfocus chat
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        } else {
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    getSocket().emit('chat_send', { message: msg });
    setInput('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') send();
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg color-${m.color}`}>
            <span className="chat-sender">{m.sender}:</span> {m.message}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Tab으로 채팅 입력 (Enter 전송)"
          maxLength={200}
        />
        <button className="chat-send-btn" onClick={send}>전송</button>
      </div>
    </div>
  );
}
