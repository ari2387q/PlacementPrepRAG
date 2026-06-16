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
  BarChart2,
  Award,
  Zap,
  ChevronRight,
  HelpCircle,
  FolderOpen
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: any[];
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          content: "Welcome to **PlacementPrep AI**! 🚀\n\nI am your placement preparation assistant powered by RAG (Retrieval-Augmented Generation). Ask me anything about:\n- Data Structures & Algorithms (DSA)\n- System Design & Databases\n- Mock Interview Questions\n- Resume Review & Behavioral Prep\n\nHow can I help you ace your interviews today?",
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

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear your chat history?")) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: "Chat history cleared. What topic shall we prepare next?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setError(null);
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

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

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
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://placementpreprag.onrender.com'}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          top_k: 5
        })
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
        sources: data.sources || []
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError("Unable to connect to the backend server.");
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "⚠️ **Connection Error**.",
        timestamp: formatTimestamp(),
        sources: []
      }]);
    } finally {
      setIsLoading(false);
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
    <div className="flex h-screen w-screen bg-themeBg text-themeTextPrimary overflow-hidden font-sans">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 lg:w-80 flex-shrink-0 bg-themeSidebar border-r border-themeBorder/70 p-5 justify-between">
        
        {/* Upper Sidebar */}
        <div className="space-y-6 overflow-y-auto pr-1">
          {/* Logo Brand */}
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

          <hr className="border-themeBorder/50" />

          {/* Stats Progress Widgets */}
          <div className="space-y-4">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-themeAccent" />
              Preparation Progress
            </h2>
            
            {/* Widget: Solved Quest */}
            <div className="bg-themeCard border border-themeBorder/40 rounded-xl p-3.5 space-y-2.5 shadow-sm">
              <div className="flex justify-between items-center text-xs">
                <span className="text-themeTextSecondary font-medium">Interview Readiness</span>
                <span className="font-bold text-themeAccent">84%</span>
              </div>
              <div className="w-full bg-themeBorder/40 h-2 rounded-full overflow-hidden">
                <div className="bg-themeAccent h-full rounded-full transition-all duration-500" style={{ width: '84%' }} />
              </div>
              <div className="flex justify-between text-[10px] text-themeTextSecondary">
                <span>15/20 Topics</span>
                <span>Active Streak: 5d</span>
              </div>
            </div>

            {/* Widget: Topics checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-themeCard/50 border border-themeBorder/20">
                <span className="flex items-center gap-2 text-themeTextSecondary">
                  <Award className="w-3.5 h-3.5 text-emerald-500" />
                  DSA Basics
                </span>
                <span className="text-[10px] font-bold text-emerald-500 uppercase px-1.5 py-0.5 rounded bg-emerald-500/10">Mastered</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-themeCard/50 border border-themeBorder/20">
                <span className="flex items-center gap-2 text-themeTextSecondary">
                  <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  System Design
                </span>
                <span className="text-[10px] font-bold text-amber-500 uppercase px-1.5 py-0.5 rounded bg-amber-500/10">In Progress</span>
              </div>
            </div>
          </div>

          <hr className="border-themeBorder/50" />

          {/* Quick links */}
          <div className="space-y-2.5">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-themeAccent" />
              Recent Subjects
            </h2>
            <div className="space-y-1">
              {["Resume Check & HR Mock", "Top FAANG Coding Prep", "Database Tuning & SQL"].map((link, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(`Help me prepare for ${link}`)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeCard transition-all text-left group"
                >
                  <span className="truncate">{link}</span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-themeAccent transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lower Sidebar (Themes & Branding) */}
        <div className="space-y-5 pt-4 border-t border-themeBorder/50">
          
          {/* Theme Selector Grid */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-themeTextSecondary">Select Theme</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme('slate')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  theme === 'slate'
                    ? 'bg-slate-800 border-indigo-500 text-white shadow'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                Slate
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-slate-100 border-indigo-600 text-slate-900 shadow'
                    : 'bg-white/40 border-slate-200 text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                Light
              </button>
              <button
                onClick={() => setTheme('cyberpunk')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  theme === 'cyberpunk'
                    ? 'bg-purple-950/70 border-fuchsia-500 text-fuchsia-300 shadow'
                    : 'bg-purple-950/20 border-purple-900/60 text-purple-400 hover:text-fuchsia-300'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
                Neon
              </button>
              <button
                onClick={() => setTheme('emerald')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  theme === 'emerald'
                    ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300 shadow'
                    : 'bg-emerald-950/20 border-emerald-900/60 text-emerald-400 hover:text-emerald-300'
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
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Main App Header */}
        <header className="flex-shrink-0 bg-themeSidebar/70 border-b border-themeBorder/70 backdrop-blur px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 rounded-lg bg-themeAccent flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-themeTextPrimary m-0 leading-tight">PlacementPrep AI</h1>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <p className="text-[10px] text-themeTextSecondary m-0 leading-none">Smart Interview Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            {/* Mobile-only Theme Swapper Icon Toggle */}
            <div className="md:hidden flex items-center bg-themeCard border border-themeBorder/40 rounded-lg p-1">
              {(['slate', 'light', 'cyberpunk', 'emerald'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                    theme === t ? 'bg-themeAccent text-white' : 'text-themeTextSecondary'
                  }`}
                  title={`Switch to ${t}`}
                >
                  {t[0].toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-themeTextSecondary hover:text-rose-500 hover:bg-rose-500/10 border border-themeBorder/50 hover:border-rose-500/20 transition-all text-xs font-semibold"
              title="Clear all messages"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear History</span>
            </button>
          </div>
        </header>

        {/* Scrollable messages box */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 w-full bg-gradient-to-b from-transparent to-themeCard/10">
          <div className="max-w-3xl mx-auto w-full flex flex-col space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-3.5 max-w-[85%] ${
                  message.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                    message.role === 'user'
                      ? 'bg-themeAccent text-white border border-themeAccent/20'
                      : 'bg-themeCard border border-themeBorder text-themeAccent'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="w-4.5 h-4.5" />
                  ) : (
                    <Bot className="w-4.5 h-4.5" />
                  )}
                </div>

                {/* Message Bubble wrapper */}
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}>
                  <div
                    className={`px-5 py-3 rounded-2xl shadow-sm text-sm leading-relaxed border ${
                      message.role === 'user'
                        ? 'bg-themeAccent border-themeAccent text-white rounded-tr-none'
                        : 'bg-themeCard border-themeBorder/80 text-themeTextPrimary rounded-tl-none'
                    }`}
                  >
                    {renderMessageContent(message.content, message.id)}
                    
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-themeCard border border-themeBorder text-themeAccent">
                  <Bot className="w-4.5 h-4.5 animate-pulse" />
                </div>
                <div className="flex flex-col items-start space-y-1">
                  <div className="px-5 py-4.5 rounded-2xl rounded-tl-none bg-themeCard border border-themeBorder/80 text-themeTextSecondary">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2.5 h-2.5 bg-themeAccent rounded-full animate-bounce"></div>
                      <span className="text-xs text-themeTextSecondary/80 ml-2 select-none">Searching...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input box section */}
        <footer className="flex-shrink-0 bg-themeSidebar/40 border-t border-themeBorder/50 backdrop-blur py-5 px-4 md:px-8">
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
                      className="text-left px-3.5 py-2.5 rounded-xl bg-themeCard border border-themeBorder/40 text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeSidebar hover:border-themeBorder transition-all duration-200 text-xs flex items-center justify-between group"
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

            {/* Constrained Input Bar Form */}
            <form onSubmit={onSubmit} className="relative flex items-end gap-2.5">
              <div className="relative flex-1 bg-themeCard border border-themeBorder focus-within:border-themeAccent/80 focus-within:ring-2 focus-within:ring-themeAccent/15 rounded-2xl transition-all duration-150 overflow-hidden flex items-end px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a placement prep question or paste code..."
                  rows={1}
                  disabled={isLoading}
                  className="w-full bg-transparent border-0 ring-0 focus:ring-0 outline-none resize-none text-sm text-themeTextPrimary placeholder-themeTextSecondary/60 py-0.5 max-h-[160px] min-h-[24px]"
                />
              </div>
              
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 w-12 h-12 rounded-2xl bg-themeAccent hover:bg-themeAccentHover disabled:bg-themeCard disabled:text-themeTextSecondary/40 disabled:border-themeBorder/50 text-white flex items-center justify-center shadow-lg shadow-themeAccent/10 hover:shadow-themeAccent/25 border border-themeAccent/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-100"
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
