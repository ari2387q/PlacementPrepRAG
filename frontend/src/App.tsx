import React, { useState, useEffect, useRef } from 'react';
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
  HelpCircle as QuizIcon
} from 'lucide-react';
import { QuizFlashcardDeck, type QuizItem } from './components/QuizFlashcardDeck';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { QuoteTooltip } from './components/QuoteTooltip';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: string[];
  pipelineStages?: any[];
}

const PRESET_PROMPTS = [
  "What questions did TCS ask in their NQT paper?",
  "What HR questions are commonly asked in campus placements?",
  "What was the Infosys interview experience like?",
  "How should I prepare for IBM technical interviews?"
];

type Theme = 'slate' | 'light' | 'cyberpunk' | 'emerald';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('slate');
  const [uploadedFile, setUploadedFile] = useState<{ sessionId: string; filename: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [quizItems, setQuizItems] = useState<QuizItem[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  
  // UI Panels toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showQuizDeck, setShowQuizDeck] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainChatRef = useRef<HTMLDivElement>(null);

  // Load chat history & theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('placement_prep_app_theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }

    const savedChat = localStorage.getItem('placement_prep_chat_history');
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    } else {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: "SYSTEM ONLINE. KNOWLEDGE BASE LOADED.\n\nReady for query input.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, []);

  // Update body class for themes
  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('placement_prep_app_theme', theme);
  }, [theme]);

  // Save chat history on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('placement_prep_chat_history', JSON.stringify(messages));
    } else {
      localStorage.removeItem('placement_prep_chat_history');
    }
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear your chat history?")) {
      return;
    }

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

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      await fetch(`${baseUrl}/clear`, { method: 'POST' });
    } catch (err) {
      console.warn('Backend history clear failed', err);
    }
  };

  const handleCopyCode = (code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // PDF Upload handler with automatic queued prompt execution
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
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const newUploaded = {
        sessionId: data.session_id,
        filename: data.filename,
      };

      setUploadedFile(newUploaded);
      setQuizItems(null);
      setQuizError(null);
      setShowQuizDeck(false);

      // If user queued a message while PDF was uploading, dispatch it now!
      if (pendingPrompt) {
        const textToDispatch = pendingPrompt;
        setPendingPrompt(null);
        setTimeout(() => {
          handleSendMessage(textToDispatch, newUploaded);
        }, 150);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to upload file.");
      setPendingPrompt(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      await fetch(`${baseUrl}/document/${sid}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error("Failed to delete document session from server", err);
    }
  };

  const handleSendMessage = async (textToSend: string, fileOverride?: { sessionId: string; filename: string }) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    // Check if upload is still in progress -> Queue prompt until upload completes
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
      timestamp: formatTimestamp()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      const url = activeFile 
        ? `${baseUrl}/document/query`
        : `${baseUrl}/query`;

      const body = activeFile
        ? {
            session_id: activeFile.sessionId,
            query: trimmed,
            top_k: 5
          }
        : {
            query: trimmed,
            top_k: 5
          };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer || "I couldn't fetch a valid answer. Please try again.",
        timestamp: formatTimestamp(),
        sources: data.sources || [],
        pipelineStages: data.pipeline_stages
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError("Unable to connect to the backend server.");
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "⚠️ **Connection Error**. Unable to retrieve response from backend server.",
        timestamp: formatTimestamp(),
        sources: []
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuizItems = async (sessionId: string) => {
    setQuizLoading(true);
    setQuizError(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com';
      const response = await fetch(`${baseUrl}/document/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, count: 4 })
      });

      if (!response.ok) {
        throw new Error(`Quiz generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data.quiz_items) || data.quiz_items.length === 0) {
        throw new Error('No quiz items were generated.');
      }

      setQuizItems(data.quiz_items);
    } catch (err: any) {
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

    if (nextShow && !quizItems) {
      await fetchQuizItems(uploadedFile.sessionId);
    }
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
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
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
                return (
                  <strong key={boldIndex} className="font-bold text-themeTextPrimary">
                    {boldPart.slice(2, -2)}
                  </strong>
                );
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
      
      {/* Floating Selection Tooltip for "Quote & Ask" */}
      <QuoteTooltip containerRef={mainChatRef} onQuote={handleQuoteText} />

      {/* 1. COLLAPSIBLE BURGER SIDEBAR */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72 lg:w-80 flex' : 'w-0 hidden'
        } flex-col flex-shrink-0 glass-panel rounded-[2.5rem] p-5 justify-between transition-all duration-300 z-20`}
      >
        {/* Upper Sidebar */}
        <div className="space-y-6 overflow-y-auto pr-1">
          {/* Logo Brand */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-themeAccent to-indigo-500 flex items-center justify-center shadow-lg shadow-themeAccent/20">
                <Sparkles className="w-5.5 h-5.5 text-white" />
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
              <Zap className="w-3 h-3" /> Dual Retrieval Engine
            </span>
            <p className="text-xs text-themeTextSecondary leading-relaxed m-0">
              Pinecone Dense Vectors + BM25 Sparse Search fused via Reciprocal Rank Fusion ($k=60$).
            </p>
          </div>
        </div>

        {/* Lower Sidebar (Themes & Settings) */}
        <div className="space-y-5 pt-4 border-t border-themeBorder/50">
          
          {/* Theme Selector Grid */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary">Select Theme</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme('slate')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'slate'
                    ? 'bg-themeAccent/20 border-themeAccent text-themeAccent shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                    : 'bg-themeBg/40 border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                Slate
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-themeAccent/20 border-themeAccent text-themeAccent shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                    : 'bg-themeBg/40 border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                Light
              </button>
              <button
                onClick={() => setTheme('cyberpunk')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'cyberpunk'
                    ? 'bg-themeAccent/20 border-themeAccent text-themeAccent shadow-[0_0_10px_rgba(217,70,239,0.2)]'
                    : 'bg-themeBg/40 border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
                Neon
              </button>
              <button
                onClick={() => setTheme('emerald')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'emerald'
                    ? 'bg-themeAccent/20 border-themeAccent text-themeAccent shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-themeBg/40 border-themeBorder text-themeTextSecondary hover:text-themeTextPrimary'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Mint
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-themeTextSecondary hover:text-themeTextPrimary transition-all cursor-pointer">
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-themeAccent" />
              Help & Documentation
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </aside>

      {/* 2. MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col min-w-0 glass-panel rounded-[2.5rem] overflow-hidden relative">
        
        {/* Main App Header with Burger Toggle */}
        <header className="flex-shrink-0 bg-themeSidebar/40 border-b border-themeBorder/30 backdrop-blur px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {/* Burger Toggle Window Icon Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-full glass-button text-themeTextSecondary hover:text-themeTextPrimary"
              title="Toggle sidebar window"
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

          <div className="flex items-center gap-3">
            {/* Quiz / Flashcard Option Toggle Button */}
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
                <span>⚡ Generate Quiz & Flashcards</span>
              </button>
            )}
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-themeTextSecondary hover:text-rose-500 hover:bg-rose-500/10 border border-themeBorder/50 hover:border-rose-500/30 transition-all text-xs font-semibold"
              title="Clear all messages"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Purge DB</span>
            </button>
          </div>
        </header>

        {/* Scrollable messages box */}
        <main ref={mainChatRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 w-full bg-gradient-to-b from-transparent to-themeCard/10">
          <div className="max-w-3xl mx-auto w-full flex flex-col space-y-6">
            
            {/* Interactive Flashcard / Quiz Option Deck */}
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
                {/* Avatar Icon */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                    message.role === 'user'
                      ? 'bg-themeAccent/20 text-themeAccent border border-themeAccent/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                      : 'bg-themeCard/80 border border-themeBorder text-themeAccent shadow-[0_0_10px_rgba(0,0,0,0.2)] backdrop-blur-md'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="w-4.5 h-4.5" />
                  ) : (
                    <Bot className="w-4.5 h-4.5" />
                  )}
                </div>

                {/* Message Bubble wrapper */}
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-1 w-full`}>
                  <div
                    className={`px-5 py-3 rounded-[2rem] shadow-sm text-sm leading-relaxed border ${
                      message.role === 'user'
                        ? 'bg-themeAccent/15 border-themeAccent/30 text-themeTextPrimary rounded-tr-sm shadow-[0_0_15px_rgba(56,189,248,0.1)] backdrop-blur-md'
                        : 'bg-themeCard/60 border-themeBorder/60 text-themeTextPrimary rounded-tl-sm backdrop-blur-md shadow-lg'
                    }`}
                  >
                    {renderMessageContent(message.content, message.id)}
                    
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

                    {/* Animated RAG Pipeline Inspector */}
                    {message.role === 'assistant' && message.id !== 'welcome' && (
                      <PipelineVisualizer stages={message.pipelineStages} />
                    )}
                  </div>
                  <span className="text-[10px] text-themeTextSecondary px-1.5">
                    {message.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {/* Loading / Typing Indicator */}
            {isLoading && (
              <div className="flex items-start gap-3.5 self-start max-w-[85%]">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-themeCard/80 border border-themeBorder text-themeAccent shadow-[0_0_10px_rgba(0,0,0,0.2)] backdrop-blur-md">
                  <Bot className="w-4.5 h-4.5 animate-pulse" />
                </div>
                <div className="flex flex-col items-start space-y-1">
                  <div className="px-5 py-4 rounded-[2rem] rounded-tl-sm bg-themeCard/60 border border-themeBorder/60 text-themeTextSecondary backdrop-blur-md shadow-lg">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                      <span className="text-xs text-themeAccent/80 ml-2 select-none uppercase tracking-widest font-bold">Querying Data...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input box section */}
        <footer className="flex-shrink-0 bg-themeSidebar/40 border-t border-themeBorder/30 backdrop-blur-md py-5 px-4 md:px-8">
          <div className="max-w-3xl mx-auto w-full flex flex-col space-y-4">
            
            {/* Quick Prompt Cards */}
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
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                        }
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

            {/* Error notifications */}
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
                      <button
                        type="button"
                        onClick={handleToggleQuizDeck}
                        className="text-[10px] font-bold text-themeAccent hover:underline"
                      >
                        {showQuizDeck ? "Hide Quiz" : "⚡ Practice Quiz"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="hover:text-rose-500 transition-colors p-0.5 rounded hover:bg-rose-500/10"
                        title="Remove PDF"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Uploading Status Banner */}
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
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf"
                    className="hidden"
                  />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder={uploadedFile ? `QUERY ${uploadedFile.filename}...` : "INPUT QUERY OR CODE..."}
                    rows={1}
                    disabled={isLoading}
                    className="w-full bg-transparent border-0 ring-0 focus:ring-0 outline-none resize-none text-sm text-themeTextPrimary placeholder-themeTextSecondary/60 py-0.5 max-h-[160px] min-h-[24px] uppercase tracking-wider font-semibold"
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
                Press Enter to send, Shift+Enter for new line. AI assistant is trained on interview prep datasets.
              </span>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}

export default App;
