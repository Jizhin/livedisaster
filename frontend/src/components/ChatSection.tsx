import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Comment } from "../types";
import { timeAgo } from "../utils/time";

// Kerala-themed random name generator
const _ADJ  = ["Bold","Calm","Swift","Silent","Brave","Deep","Wild","Bright","Quiet","Strong","Fierce","Gentle"];
const _NOUN = ["River","Mountain","Monsoon","Coconut","Backwater","Tiger","Eagle","Wave","Storm","Forest","Rain","Cloud"];

function getOrCreateChatName(): string {
  try {
    const stored = localStorage.getItem("kl_chat_name");
    if (stored) return stored;
    const name = `${_ADJ[Math.floor(Math.random() * _ADJ.length)]} ${_NOUN[Math.floor(Math.random() * _NOUN.length)]}`;
    localStorage.setItem("kl_chat_name", name);
    return name;
  } catch {
    return "Anonymous";
  }
}

export function ChatSection({ reportId }: { reportId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [chatName]              = useState(getOrCreateChatName);
  const bottomRef               = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const detail = await api.reportDetail(reportId);
      setComments(detail.comments ?? []);
    } catch { /* silent */ }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);  // poll every 10s
    return () => clearInterval(interval);
  }, [reportId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.addComment(reportId, { author_name: chatName, content: text.trim() });
      setText("");
      await load();
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="chat-section">
      <div className="chat-header">
        <span className="chat-title">Community Chat</span>
        <span className="chat-name-pill">You: {chatName}</span>
      </div>

      <div className="chat-messages">
        {comments.length === 0 ? (
          <p className="chat-empty">No messages yet — be the first to comment</p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`chat-msg${c.author_name === chatName ? " chat-msg--own" : ""}`}
            >
              <div className="chat-bubble">
                <span className="chat-author">{c.author_name}</span>
                <p className="chat-text">{c.content}</p>
                <span className="chat-time">{timeAgo(c.created_at)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={500}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
