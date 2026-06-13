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
  MessageSquare
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const PRESET_PROMPTS = [
  "Explain the difference between SQL and NoSQL databases.",
  "How does RAG (Retrieval-Augmented Generation) work in AI chatbots?",
  "Can you give me a mock technical question on Dynamic Programming?",
  "What are the most common behavioral questions in product company interviews?"
];

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history on mount
  useEffect(() => {
    const saved = localStorage.getItem('placement_prep_chat_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    } else {
      // Add welcome message if empty
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

  // Save chat history on message change
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

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('http://localhost:8000/query', {
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
        timestamp: formatTimestamp()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError("Unable to connect to the backend server. Please verify that the local RAG API is running at http://localhost:8000");
      
      // Add a system warning message to chat
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "⚠️ **Connection Error**: I failed to reach the RAG backend server at `http://localhost:8000/query`. Please make sure the backend is active.",
        timestamp: formatTimestamp()
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

  // Helper function to render text with markdown code styling
  const renderMessageContent = (content: string, msgId: string) => {
    // Regex to detect code blocks marked by triple backticks
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const language = match ? match[1] : 'code';
        const code = match ? match[2] : part.slice(3, -3);
        const blockId = `${msgId}-code-${index}`;
        
        return (
          <div key={index} className="my-3 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 font-mono text-xs md:text-sm">
            <div className="flex justify-between items-center px-4 py-1.5 bg-slate-900 border-b border-slate-700 text-slate-400 select-none">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold lowercase">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                {language}
              </span>
              <button 
                onClick={() => handleCopyCode(code.trim(), blockId)}
                className="flex items-center gap-1 hover:text-white transition-colors text-[10px] uppercase font-bold tracking-wider"
              >
                {copiedId === blockId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
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

      // Handle inline code `code`
      const inlineParts = part.split(/(`[^`\n]+`)/g);
      return (
        <span key={index}>
          {inlineParts.map((inlinePart, subIndex) => {
            if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
              return (
                <code key={subIndex} className="px-1.5 py-0.5 rounded bg-slate-900/90 text-indigo-300 font-mono text-xs md:text-sm border border-slate-800">
                  {inlinePart.slice(1, -1)}
                </code>
              );
            }
            // Bold text **bold**
            const boldParts = inlinePart.split(/(\*\*[^*]+\*\*)/g);
            return boldParts.map((boldPart, boldIndex) => {
              if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
                return (
                  <strong key={boldIndex} className="font-semibold text-white">
                    {boldPart.slice(2, -2)}
                  </strong>
                );
              }
              // Normal text with linebreaks
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
    <div className="flex flex-col h-screen w-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <header className="flex-shrink-0 bg-slate-900/80 border-b border-slate-800/60 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10 shadow-lg shadow-black/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Sparkles className="w-5.5 h-5.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white m-0 leading-tight">PlacementPrep AI</h1>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-xs text-slate-400 m-0 leading-none">RAG-Powered Smart Interview Coach</p>
          </div>
        </div>

        <button
          onClick={clearHistory}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20 transition-all duration-200 text-xs font-medium"
          title="Clear all messages"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear History</span>
        </button>
      </header>

      {/* Main Chat Frame */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col space-y-6 max-w-5xl mx-auto w-full">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start gap-3.5 max-w-[85%] ${
              message.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                message.role === 'user'
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-indigo-600/10 border border-indigo-500/20 text-indigo-400'
              }`}
            >
              {message.role === 'user' ? (
                <User className="w-4.5 h-4.5" />
              ) : (
                <Bot className="w-4.5 h-4.5" />
              )}
            </div>

            {/* Bubble wrapper */}
            <div className="flex flex-col space-y-1">
              <div
                className={`px-4.5 py-3 rounded-2xl shadow-sm text-sm leading-relaxed border ${
                  message.role === 'user'
                    ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none'
                    : 'bg-slate-900 border-slate-800/80 text-slate-200 rounded-tl-none'
                }`}
              >
                {renderMessageContent(message.content, message.id)}
              </div>
              <span
                className={`text-[10px] text-slate-500 px-1 ${
                  message.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                {message.timestamp}
              </span>
            </div>
          </div>
        ))}

        {/* Loading / Typing Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3.5 self-start max-w-[85%]">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <Bot className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <div className="flex flex-col space-y-1">
              <div className="px-4.5 py-4 rounded-2xl rounded-tl-none bg-slate-900 border border-slate-800/80 text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <div className="w-2.5 h-2.5 bg-indigo-500/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2.5 h-2.5 bg-indigo-500/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2.5 h-2.5 bg-indigo-500/80 rounded-full animate-bounce"></div>
                  <span className="text-xs text-slate-500 ml-2 select-none">Searching RAG database...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Preset Prompts & Input Box */}
      <footer className="flex-shrink-0 bg-slate-900/60 border-t border-slate-800/60 backdrop-blur-md py-4 px-4 md:px-8 z-10">
        <div className="max-w-5xl mx-auto w-full flex flex-col space-y-4">
          
          {/* Suggestion Chips (Show only when context is empty or only welcome message exists) */}
          {messages.length <= 1 && !isLoading && (
            <div className="hidden sm:flex flex-col space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                Suggested prep topics
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {PRESET_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(prompt);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }}
                    className="text-left px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700 transition-all duration-200 text-xs flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connection Error Banner */}
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actual Form */}
          <form onSubmit={onSubmit} className="relative flex items-end gap-2">
            <div className="relative flex-1 bg-slate-950/80 border border-slate-800 focus-within:border-indigo-500/80 focus-within:ring-2 focus-within:ring-indigo-500/15 rounded-2xl transition-all duration-200 overflow-hidden flex items-end px-3.5 py-2.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a placement prep question or paste code..."
                rows={1}
                disabled={isLoading}
                className="w-full bg-transparent border-0 ring-0 focus:ring-0 outline-none resize-none text-sm text-slate-100 placeholder-slate-500 py-1 max-h-[180px] min-h-[24px]"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-800/80 text-white flex items-center justify-center shadow-lg shadow-indigo-600/15 hover:shadow-indigo-500/20 border border-indigo-500/20 transition-all duration-150"
            >
              {isLoading ? (
                <RefreshCw className="w-4.5 h-4.5 animate-spin" />
              ) : (
                <Send className="w-4.5 h-4.5" />
              )}
            </button>
          </form>
          
          <div className="text-center">
            <span className="text-[10px] text-slate-500 select-none">
              Press Enter to send, Shift+Enter for new line. AI assistant is trained on interview prep datasets.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
