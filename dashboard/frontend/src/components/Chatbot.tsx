import React from "react";
import type { UploadResponse } from "../types";

// Use relative path if VITE_API_BASE is not set (for production)
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "");

type Props = { context?: UploadResponse | null };

type Msg = { role: "user" | "assistant"; text: string };

const Chatbot: React.FC<Props> = ({ context }) => {
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msgs, setMsgs] = React.useState<Msg[]>([
    { role: "assistant", text: "Hi! How can I help with this dataset?" },
  ]);
  const [theme, setTheme] = React.useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const quickReplies = React.useMemo(() => [
    "Summarise key gaps",
    "Suggest KPIs to monitor",
    "Highlight risky areas",
    "Export this dataset",
  ], []);

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          columns: context?.columns ?? [],
          preview: context?.preview ?? [],
          row_count: context?.row_count ?? context?.preview?.length ?? 0,
          metrics: context?.metrics ?? null,
          timeseries: context?.timeseries ?? null,
        }),
      });
      const json = await res.json();
      setMsgs((m) => [...m, { role: "assistant", text: json.answer || "Thanks! Let me check that for you." }]);
      if (!open) setUnread(true);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: e?.message || "Request failed" }]);
      if (!open) setUnread(true);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickReply = (text: string) => {
    setInput('');
    send(text);
  };

  // Close when clicking outside panel
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (panelRef.current && panelRef.current.contains(t)) return;
      if (toggleRef.current && toggleRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Close on ESC
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Autoscroll to bottom on new messages
  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, open]);

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(current);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <button
        className={`btn btn-accent chat-toggle ${unread ? 'unread' : ''}`}
        ref={toggleRef}
        onClick={() => { setOpen((v) => !v); setUnread(false); }}
        style={{ position: "fixed", right: 20, bottom: 20, borderRadius: 999, padding: "12px 16px", boxShadow: "0 10px 30px rgb(0 0 0 / 35%)", zIndex: 50 }}
      >
        {open ? "Close Chat" : "Ask AI"}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="chat-modal chat-animate-in"
          data-theme={theme}
          style={{
            position: "fixed",
            right: 24,
            bottom: 88,
            width: 360,
            height: 500,
            display: "flex",
            flexDirection: "column",
            overflow: 'hidden'
          }}
        >
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'transparent', borderBottom: '1px solid var(--border)' }}>
            <span>Assistant</span>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} aria-label="Close" title="Close" style={{ padding: '6px 8px' }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, flex: 1 }}>
            <div className="quick-replies">
              {quickReplies.map((reply) => (
                <button key={reply} onClick={() => handleQuickReply(reply)} disabled={busy}>{reply}</button>
              ))}
            </div>
            <div ref={scrollRef} style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingRight: 2, paddingTop: 6 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                  <div className={`chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}`} style={{ padding: '9px 11px', borderRadius: 14, fontSize: 13, lineHeight: 1.5 }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="chat-bubble assistant" style={{ width: 'fit-content' }}>
                  <div className="typing-dots"><span /><span /><span /></div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: 'flex-end' }}>
              <textarea
                className="textarea"
                placeholder="Type your message (Shift+Enter for new line)"
                value={input}
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => {
                  const ta = e.currentTarget; ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                style={{ flex: 1 }}
              />
              <button className="btn btn-violet" style={{ padding: '10px 12px' }} onClick={() => send()} disabled={busy}>Send</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;
