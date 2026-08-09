import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  Trash2, 
  Bot, 
  User, 
  Sparkles, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  Copy,
  Terminal,
  BookOpen,
  MessageSquare,
  ChevronRight,
  HelpCircle,
  Plus,
  FileText,
  X,
  Menu,
  Zap,
  HelpCircle as QuizIcon,
  LogIn,
  Clock,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { QuizFlashcardDeck, type QuizItem } from './components/QuizFlashcardDeck';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { QuoteTooltip } from './components/QuoteTooltip';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HelpModal } from './components/HelpModal';
import { AuthModal } from './components/AuthModal';
import { useAuth } from './hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipelineStages?: any[];
  isStreaming?: boolean;
}

const PRESET_PROMPTS = [
  "What questions did TCS ask in their NQT paper?",
  "What HR questions are commonly asked in campus placements?",
  "What was the Infosys interview experience like?",
  "How should I prepare for IBM technical interviews?"
];

type Theme = 'slate' | 'light' | 'cyberpunk' | 'emerald';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';

function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedChat = localStorage.getItem('placement_prep_chat_history');
    if (savedChat) {
      try {
        return JSON.parse(savedChat);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: "SYSTEM ONLINE. KNOWLEDGE BASE LOADED.\n\nReady for query input.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('placement_prep_app_theme') as Theme) || 'slate');
  const [uploadedFile, setUploadedFile] = useState<{ sessionId: string; filename: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [quizItems, setQuizItems] = useState<QuizItem[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  // UI Panels
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showQuizDeck, setShowQuizDeck] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sidebarHistoryExpanded, setSidebarHistoryExpanded] = useState(true);

  // Streaming state
  const streamAbortRef = useRef<AbortController | null>(null);

  // Auth
  const { user, login, logout } = useAuth();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainChatRef = useRef<HTMLDivElement>(null);

  // Update body class for themes
  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('placement_prep_app_theme', theme);
  }, [theme]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sync to MongoDB on login
  useEffect(() => {
    if (user?.email) {
      setIsLoading(true);
      fetch(`${BASE_URL}/history/${user.email}`)
        .then(res => res.json())
        .then(data => {
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        })
        .catch(err => console.error("Failed to fetch history", err))
        .finally(() => setIsLoading(false));
    }
  }, [user?.email]);

  // Save chat history on change (and sync to MongoDB)
  useEffect(() => {
    if (messages.length > 0) {
      // Don't persist streaming placeholders
      const toSave = messages.map(m => ({ ...m, isStreaming: false }));
      localStorage.setItem('placement_prep_chat_history', JSON.stringify(toSave));
      
      if (user?.email) {
        fetch(`${BASE_URL}/history/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, messages: toSave })
        }).catch(err => console.error("Failed to sync history", err));
      }
    } else {
      localStorage.removeItem('placement_prep_chat_history');
    }
    scrollToBottom();
  }, [messages, user?.email]);

  // Ctrl+K to focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Clear History (with custom dialog) ───────────────────────────────────────
  const clearHistory = async () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "MEMORY WIPED. SYSTEM READY.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setError(null);
    setShowQuizDeck(false);
    setQuizItems(null);
    setQuizError(null);
    setShowConfirmDialog(false);

    try {
      await fetch(`${BASE_URL}/clear`, { method: 'POST' });
    } catch (err) {
      console.warn('Backend history clear failed', err);
    }
  };

  const handleCopyCode = (code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── PDF Upload ────────────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError("Only PDF files are supported.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setQuizItems(null);
    setQuizError(null);
    setShowQuizDeck(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const newUploaded = { sessionId: data.session_id, filename: data.filename };
      setUploadedFile(newUploaded);
      setQuizItems(null);
      setQuizError(null);
      setShowQuizDeck(false);

      if (pendingPrompt) {
        const textToDispatch = pendingPrompt;
        setPendingPrompt(null);
        setTimeout(() => handleSendMessage(textToDispatch, newUploaded), 150);
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error(err);
      setError(err.message || "Failed to upload file.");
      setPendingPrompt(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async () => {
    if (!uploadedFile) return;
    const sid = uploadedFile.sessionId;
    setUploadedFile(null);
    setShowQuizDeck(false);
    setQuizItems(null);
    setQuizError(null);
    try {
      await fetch(`${BASE_URL}/document/${sid}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Failed to delete document session from server", err);
    }
  };

  // ── SSE Streaming Send ────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async (textToSend: string, fileOverride?: { sessionId: string; filename: string }) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    if (isUploading && !fileOverride) {
      setPendingPrompt(trimmed);
      setInput('');
      return;
    }

    const activeFile = fileOverride || uploadedFile;

    setError(null);
    const userMsgId = Date.now().toString();
    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      timestamp: formatTimestamp(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Create a placeholder assistant message for streaming
    const assistantMsgId = (Date.now() + 1).toString();
    const placeholder: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: formatTimestamp(),
      sources: [],
      pipelineStages: [],
      isStreaming: true,
    };
    setMessages(prev => [...prev, placeholder]);

    // Abort any existing stream
    if (streamAbortRef.current) streamAbortRef.current.abort();
    const abortCtrl = new AbortController();
    streamAbortRef.current = abortCtrl;

    const streamUrl = activeFile ? `${BASE_URL}/document/query/stream` : `${BASE_URL}/query/stream`;
    const body = activeFile
      ? { session_id: activeFile.sessionId, query: trimmed, top_k: 5 }
      : { query: trimmed, top_k: 5 };

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortCtrl.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';
      let sources: string[] = [];
      let pipelineStages: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // handled with next data line
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            const prevLines = lines.slice(0, lines.indexOf(line));
            const eventLine = prevLines.reverse().find(l => l.startsWith('event: '));
            const eventType = eventLine ? eventLine.slice(7).trim() : 'token';

            if (eventType === 'metadata') {
              try {
                const meta = JSON.parse(data);
                sources = meta.sources ?? [];
                pipelineStages = meta.pipeline_stages ?? [];
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, sources, pipelineStages }
                    : m
                ));
              } catch { /* ignore parse errors */ }
            } else if (eventType === 'token') {
              accumulatedContent += data;
              const captured = accumulatedContent;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: captured, isStreaming: true }
                  : m
              ));
            } else if (eventType === 'done' || eventType === 'error') {
              break;
            }
          }
        }
      }

      // Finalize message
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: accumulatedContent || "I couldn't fetch a valid answer. Please try again.", isStreaming: false }
          : m
      ));

    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (err.name === 'AbortError') return;

      console.error('Streaming failed, falling back to standard endpoint:', err);

      // Fallback to non-streaming
      try {
        const url = activeFile ? `${BASE_URL}/document/query` : `${BASE_URL}/query`;
        const fbBody = activeFile
          ? { session_id: activeFile.sessionId, query: trimmed, top_k: 5 }
          : { query: trimmed, top_k: 5 };

        const fbRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fbBody),
        });
        const data = await fbRes.json();
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: data.answer || "I couldn't fetch a valid answer.",
                sources: data.sources || [],
                pipelineStages: data.pipeline_stages,
                isStreaming: false,
              }
            : m
        ));
      } catch {
        setError("Unable to connect to the backend server.");
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: "⚠️ **Connection Error**. Unable to retrieve response from backend server.", isStreaming: false }
            : m
        ));
      }
    } finally {
      setIsLoading(false);
      streamAbortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploading, uploadedFile]);

  // ── Quiz ──────────────────────────────────────────────────────────────────────
  const fetchQuizItems = async (sessionId: string) => {
    setQuizLoading(true);
    setQuizError(null);
    try {
      const response = await fetch(`${BASE_URL}/document/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, count: 4 }),
      });
      if (!response.ok) throw new Error(`Quiz generation failed: ${response.statusText}`);
      const data = await response.json();
      if (!Array.isArray(data.quiz_items) || data.quiz_items.length === 0)
        throw new Error('No quiz items were generated.');
      setQuizItems(data.quiz_items);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setQuizItems([]);
      setQuizError(err?.message || 'Failed to generate quiz items.');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleToggleQuizDeck = async () => {
    if (!uploadedFile) return;
    const nextShow = !showQuizDeck;
    setShowQuizDeck(nextShow);
    if (nextShow && !quizItems) await fetchQuizItems(uploadedFile.sessionId);
  };

  const handleQuoteText = (selectedText: string) => {
    const formatted = `> "${selectedText}"`;
    setInput(prev => prev ? `${prev}\n\n${formatted}` : formatted);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // ── Chat history entries (user messages only, for sidebar) ────────────────────
  const chatHistoryEntries = messages.filter(m => m.role === 'user').slice(-8).reverse();

  // ── Render message content ────────────────────────────────────────────────────
  const renderMessageContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const language = match ? match[1] : 'code';
        const code = match ? match[2] : part.slice(3, -3);
        const blockId = `${msgId}-code-${index}`;
        return (
          <div key={index} className="my-3 rounded-xl overflow-hidden border border-themeBorder bg-[#050912] font-mono text-xs md:text-sm shadow-inner">
            <div className="flex justify-between items-center px-4 py-2 bg-themeSidebar border-b border-themeBorder text-themeTextSecondary select-none">
              <span className="flex items-center gap-1.5 font-semibold lowercase">
                <Terminal className="w-3.5 h-3.5 text-themeAccent" />
                {language}
              </span>
              <button
                onClick={() => handleCopyCode(code.trim(), blockId)}
                className="flex items-center gap-1 hover:text-themeTextPrimary transition-colors text-[10px] uppercase font-bold tracking-wider"
              >
                {copiedId === blockId ? (
                  <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
                ) : (
                  <><Copy className="w-3 h-3" /><span>Copy</span></>
                )}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-slate-300 whitespace-pre-wrap break-all md:break-normal">
              <code>{code.trim()}</code>
            </pre>
          </div>
        );
      }

      const inlineParts = part.split(/(`[^`\n]+`)/g);
      return (
        <span key={index}>
          {inlineParts.map((inlinePart, subIndex) => {
            if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
              return (
                <code key={subIndex} className="px-1.5 py-0.5 rounded bg-slate-900/60 text-themeAccent font-mono text-xs md:text-sm border border-themeBorder/40">
                  {inlinePart.slice(1, -1)}
                </code>
              );
            }
            const boldParts = inlinePart.split(/(\*\*[^*]+\*\*)/g);
            return boldParts.map((boldPart, boldIndex) => {
              if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
                return <strong key={boldIndex} className="font-bold text-themeTextPrimary">{boldPart.slice(2, -2)}</strong>;
              }
              return boldPart.split('\n').map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {line}
                </React.Fragment>
              ));
            });
          })}
        </span>
      );
    });
  };

  return (
    <div className="flex h-screen w-screen bg-themeBg text-themeTextPrimary overflow-hidden font-sans p-2 md:p-4 lg:p-6 gap-4">

      {/* Modals */}
      <QuoteTooltip containerRef={mainChatRef} onQuote={handleQuoteText} />

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Purge Chat History?"
        message="This will permanently delete your entire conversation history and reset the AI memory. This action cannot be undone."
        confirmLabel="Yes, Purge"
        cancelLabel="Cancel"
        onConfirm={clearHistory}
        onCancel={() => setShowConfirmDialog(false)}
      />

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        user={user}
        onLoginSuccess={login}
        onLogout={() => {
          logout();
          clearHistory();
        }}
      />

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside
        className={`${
          isSidebarOpen ? 'w-72 lg:w-80 flex' : 'w-0 hidden'
        } flex-col flex-shrink-0 glass-panel rounded-[2.5rem] p-5 justify-between transition-all duration-300 z-20`}
      >
        {/* Upper Sidebar */}
        <div className="space-y-5 overflow-y-auto pr-1 flex-1">

          {/* Logo Brand */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-themeAccent to-indigo-500 flex items-center justify-center shadow-lg shadow-themeAccent/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-extrabold tracking-tight">PrepAI Dashboard</span>
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-themeTextSecondary tracking-wider uppercase font-semibold leading-none">RAG Placement Hub</p>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-full text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeCard transition-colors md:hidden"
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick RAG Info Card */}
          <div className="p-3.5 rounded-xl bg-themeCard border border-themeBorder/60 space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-themeAccent flex items-center gap-1">
              <Layers className="w-3 h-3" /> Dual Retrieval Engine
            </span>
            <p className="text-xs text-themeTextSecondary leading-relaxed m-0">
              Pinecone Dense + BM25 Sparse fused via Reciprocal Rank Fusion (k=60).
            </p>
          </div>

          {/* Quick Prompts in Sidebar */}
          {messages.length > 1 && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-themeAccent" /> Quick Prompts
              </span>
            <div className="space-y-1.5">
              {PRESET_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(prompt);
                    textareaRef.current?.focus();
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-themeCard/60 border border-themeBorder/40 text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeSidebar/80 hover:border-themeAccent/40 transition-all duration-200 text-[11px] flex items-center justify-between group"
                >
                  <span className="truncate leading-snug pr-2">{prompt}</span>
                  <ChevronRight className="w-3 h-3 flex-shrink-0 text-themeTextSecondary group-hover:text-themeAccent transition-colors" />
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Active Document Session */}
          {uploadedFile && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-themeAccent" /> Active Document
              </span>
              <div className="p-3 rounded-xl bg-themeAccent/10 border border-themeAccent/25 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-themeAccent flex-shrink-0" />
                  <span className="text-xs font-medium text-themeTextPrimary truncate">{uploadedFile.filename}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleQuizDeck}
                    className="flex-1 text-[10px] font-bold text-themeAccent hover:underline text-left"
                  >
                    {showQuizDeck ? "Hide Quiz" : "⚡ Practice Quiz"}
                  </button>
                  <button
                    onClick={handleRemoveFile}
                    className="p-1 rounded hover:text-rose-400 hover:bg-rose-500/10 text-themeTextSecondary transition-colors"
                    title="Remove document"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat History */}
          <div className="space-y-2">
            <button
              onClick={() => setSidebarHistoryExpanded(p => !p)}
              className="w-full flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary"
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-themeAccent" /> Recent Queries
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sidebarHistoryExpanded ? 'rotate-180' : ''}`} />
            </button>

            {sidebarHistoryExpanded && (
              <div className="space-y-1">
                {chatHistoryEntries.length === 0 ? (
                  <p className="text-[10px] text-themeTextSecondary/60 px-2 italic">No queries yet</p>
                ) : (
                  chatHistoryEntries.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-themeCard/40 border border-themeBorder/30 group cursor-default"
                      title={m.content}
                    >
                      <MessageSquare className="w-3 h-3 text-themeAccent flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-themeTextSecondary group-hover:text-themeTextPrimary transition-colors truncate leading-snug">
                          {m.content}
                        </p>
                        <span className="text-[9px] text-themeTextSecondary/50">{m.timestamp}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lower Sidebar */}
        <div className="space-y-4 pt-4 border-t border-themeBorder/50 flex-shrink-0">

          {/* Theme Selector */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary">Select Theme</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'slate', label: 'Slate', color: 'bg-indigo-500', glow: 'rgba(56,189,248,0.2)' },
                { id: 'light', label: 'Light', color: 'bg-indigo-600', glow: 'rgba(99,102,241,0.2)' },
                { id: 'cyberpunk', label: 'Neon', color: 'bg-fuchsia-500', glow: 'rgba(217,70,239,0.2)' },
                { id: 'emerald', label: 'Mint', color: 'bg-emerald-500', glow: 'rgba(16,185,129,0.2)' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    theme === t.id
                      ? `bg-themeAccent/20 border-themeAccent text-themeAccent shadow-[0_0_10px_${t.glow}]`
                      : 'bg-themeBg/40 border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${t.color}`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Help & Documentation — now functional */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="w-full flex items-center justify-between text-xs text-themeTextSecondary hover:text-themeTextPrimary transition-all cursor-pointer p-0 bg-transparent border-0 group"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-themeAccent" />
              Help &amp; Documentation
            </span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 glass-panel rounded-[2.5rem] overflow-hidden relative">

        {/* Header */}
        <header className="flex-shrink-0 bg-themeSidebar/40 border-b border-themeBorder/30 backdrop-blur px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-full glass-button text-themeTextSecondary hover:text-themeTextPrimary"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-themeTextPrimary m-0 leading-tight">PlacementPrep AI</h1>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <p className="text-[10px] text-themeTextSecondary m-0 leading-none">Smart Placement Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quiz Button */}
            {uploadedFile && (
              <button
                onClick={handleToggleQuizDeck}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${
                  showQuizDeck
                    ? 'bg-themeAccent border-themeAccent text-white'
                    : 'bg-themeAccent/15 border-themeAccent/40 text-themeAccent hover:bg-themeAccent/25'
                }`}
              >
                <QuizIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">⚡ Generate Quiz</span>
              </button>
            )}

            {/* Auth Button */}
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-themeBorder/50 text-themeTextSecondary hover:text-themeTextPrimary hover:border-themeAccent/40 transition-all text-xs font-semibold"
              title={user ? user.name : 'Sign In with Google'}
            >
              {user ? (
                <>
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-themeAccent/20 flex items-center justify-center">
                      <User className="w-3 h-3 text-themeAccent" />
                    </div>
                  )}
                  <span className="hidden sm:inline max-w-[80px] truncate">{user.name.split(' ')[0]}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign In</span>
                </>
              )}
            </button>

            {/* Clear / Purge Button */}
            <button
              onClick={() => setShowConfirmDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-themeTextSecondary hover:text-rose-500 hover:bg-rose-500/10 border border-themeBorder/50 hover:border-rose-500/30 transition-all text-xs font-semibold"
              title="Clear all messages"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Purge DB</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <main ref={mainChatRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 w-full bg-gradient-to-b from-transparent to-themeCard/10">
          <div className="max-w-3xl mx-auto w-full flex flex-col space-y-6">

            {/* Quiz Deck */}
            {uploadedFile && showQuizDeck && (
              <QuizFlashcardDeck
                filename={uploadedFile.filename}
                sessionId={uploadedFile.sessionId}
                items={quizItems}
                isLoading={quizLoading}
                errorMessage={quizError}
                onRetry={() => uploadedFile && fetchQuizItems(uploadedFile.sessionId)}
                onClose={() => setShowQuizDeck(false)}
              />
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-3.5 max-w-[85%] ${
                  message.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                    message.role === 'user'
                      ? 'bg-themeAccent/20 text-themeAccent border border-themeAccent/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                      : 'bg-themeCard/80 border border-themeBorder text-themeAccent shadow-[0_0_10px_rgba(0,0,0,0.2)] backdrop-blur-md'
                  }`}
                >
                  {message.role === 'user' ? (
                    user?.picture ? (
                      <img src={user.picture} alt="You" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-4 h-4" />
                    )
                  ) : (
                    <Bot className={`w-4 h-4 ${message.isStreaming ? 'animate-pulse' : ''}`} />
                  )}
                </div>

                {/* Message Bubble */}
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-1 w-full`}>
                  <div
                    className={`px-5 py-3 rounded-[2rem] shadow-sm text-sm leading-relaxed border ${
                      message.role === 'user'
                        ? 'bg-themeAccent/15 border-themeAccent/30 text-themeTextPrimary rounded-tr-sm shadow-[0_0_15px_rgba(56,189,248,0.1)] backdrop-blur-md'
                        : 'bg-themeCard/60 border-themeBorder/60 text-themeTextPrimary rounded-tl-sm backdrop-blur-md shadow-lg'
                    }`}
                  >
                    {message.content
                      ? renderMessageContent(message.content, message.id)
                      : message.isStreaming && (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-themeAccent animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-themeAccent animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-themeAccent animate-bounce" />
                          </span>
                        )
                    }

                    {/* Streaming cursor */}
                    {message.isStreaming && message.content && (
                      <span className="inline-block w-0.5 h-4 bg-themeAccent ml-0.5 animate-pulse align-text-bottom" />
                    )}

                    {/* Sources Badge */}
                    {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 items-center text-[10px] text-themeTextSecondary border-t border-themeBorder/30 pt-2 select-none">
                        <span className="font-semibold uppercase tracking-wider text-[9px]">Sources:</span>
                        {message.sources.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-themeBg/40 border border-themeBorder/50 font-mono text-[9px] text-themeAccent" title={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Pipeline Visualizer */}
                    {message.role === 'assistant' && message.id !== 'welcome' && !message.isStreaming && (
                      <PipelineVisualizer stages={message.pipelineStages} />
                    )}
                  </div>
                  <span className="text-[10px] text-themeTextSecondary px-1.5">{message.timestamp}</span>
                </div>
              </div>
            ))}

            {/* Loading indicator (shown before first stream token arrives) */}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex items-start gap-3.5 self-start max-w-[85%]">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-themeCard/80 border border-themeBorder text-themeAccent backdrop-blur-md">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="px-5 py-4 rounded-[2rem] rounded-tl-sm bg-themeCard/60 border border-themeBorder/60 backdrop-blur-md shadow-lg">
                  <div className="flex items-center space-x-2">
                    <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                    <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                    <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                    <span className="text-xs text-themeAccent/80 ml-2 select-none uppercase tracking-widest font-bold">Querying Data...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Footer */}
        <footer className="flex-shrink-0 bg-themeSidebar/40 border-t border-themeBorder/30 backdrop-blur-md py-5 px-4 md:px-8">
          <div className="max-w-3xl mx-auto w-full flex flex-col space-y-4">

            {/* Quick Prompt Cards — shown only before first message */}
            {messages.length <= 1 && !isLoading && (
              <div className="flex flex-col space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-themeTextSecondary flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-themeAccent" />
                  Suggested prep topics
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(prompt);
                        textareaRef.current?.focus();
                      }}
                      className="text-left px-4 py-3 rounded-[1.5rem] bg-themeCard/60 border border-themeBorder/40 text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeSidebar/80 hover:border-themeAccent/40 transition-all duration-300 text-xs flex items-center justify-between group backdrop-blur-sm"
                    >
                      <span className="truncate">{prompt}</span>
                      <MessageSquare className="w-3.5 h-3.5 text-themeTextSecondary group-hover:text-themeAccent transition-colors flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={onSubmit} className="relative flex items-end gap-2.5">
              <div className="relative flex-1 bg-themeCard/60 backdrop-blur-xl border border-themeBorder focus-within:border-themeAccent/80 focus-within:ring-2 focus-within:ring-themeAccent/20 focus-within:shadow-[0_0_20px_rgba(56,189,248,0.15)] rounded-[2rem] transition-all duration-300 overflow-hidden flex flex-col px-5 py-3">

                {/* Uploaded File Badge */}
                {uploadedFile && (
                  <div className="flex items-center justify-between gap-2 mb-2 bg-themeBg/60 border border-themeBorder rounded-lg px-2.5 py-1.5 text-xs text-themeTextSecondary">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-themeAccent" />
                      <span className="truncate max-w-[180px] font-medium">{uploadedFile.filename}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleToggleQuizDeck} className="text-[10px] font-bold text-themeAccent hover:underline">
                        {showQuizDeck ? "Hide Quiz" : "⚡ Practice Quiz"}
                      </button>
                      <button type="button" onClick={handleRemoveFile} className="hover:text-rose-500 transition-colors p-0.5 rounded hover:bg-rose-500/10" title="Remove PDF">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Uploading Banner */}
                {isUploading && (
                  <div className="flex items-center gap-2 mb-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-2.5 py-1.5 text-xs text-indigo-300">
                    <RefreshCw className="w-4 h-4 animate-spin text-themeAccent" />
                    <span className="animate-pulse font-medium">Embedding PDF chunks into RAM...</span>
                  </div>
                )}

                {/* Queued Prompt Banner */}
                {pendingPrompt && (
                  <div className="flex items-center gap-2 mb-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-xs text-amber-300">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="truncate font-medium">Prompt queued: "{pendingPrompt}" — auto-sending once indexing finishes</span>
                  </div>
                )}

                <div className="flex items-end gap-2 w-full">
                  <button
                    type="button"
                    disabled={isUploading || isLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-themeBg/80 border border-themeBorder hover:border-themeAccent/50 text-themeTextSecondary hover:text-themeAccent flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(56,189,248,0.2)] mb-0.5"
                    title="Upload PDF document"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder={uploadedFile ? `Query ${uploadedFile.filename}...` : "Input query or code..."}
                    rows={1}
                    disabled={isLoading}
                    className="w-full bg-transparent border-0 ring-0 focus:ring-0 outline-none resize-none text-sm text-themeTextPrimary placeholder-themeTextSecondary/60 py-0.5 max-h-[160px] min-h-[24px] font-normal"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 w-12 h-12 rounded-full bg-themeAccent/20 hover:bg-themeAccent/30 disabled:bg-themeCard/40 disabled:text-themeTextSecondary/40 disabled:border-themeBorder/30 text-themeAccent flex items-center justify-center border border-themeAccent/40 hover:border-themeAccent hover:shadow-[0_0_15px_rgba(56,189,248,0.4)] disabled:shadow-none hover:scale-[1.05] active:scale-[0.95] transition-all duration-300 backdrop-blur-md"
              >
                {isLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </form>

            <div className="text-center">
              <span className="text-[10px] text-themeTextSecondary select-none">
                Enter to send · Shift+Enter for new line · Ctrl+K to focus · Responses stream in real-time
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
