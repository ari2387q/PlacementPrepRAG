import React, { useEffect } from 'react';
import {
  X,
  Keyboard,
  BookOpen,
  Zap,
  MessageSquare,
  FileText,
  Building2,
  ChevronRight,
  Bot,
  Search,
  Layers,
  Cpu,
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutRow: React.FC<{ keys: string[]; label: string }> = ({ keys, label }) => (
  <div className="flex items-center justify-between py-2 border-b border-themeBorder/30 last:border-0">
    <span className="text-xs text-themeTextSecondary">{label}</span>
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-themeTextSecondary/50 text-[10px]">+</span>}
          <kbd className="px-2 py-0.5 rounded-md bg-themeBg border border-themeBorder/60 text-[10px] font-mono font-bold text-themeTextPrimary shadow-sm">
            {k}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  </div>
);

const SectionCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-xl border border-themeBorder/50 bg-themeBg/40 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="text-themeAccent">{icon}</span>
      <h3 className="text-xs font-bold uppercase tracking-widest text-themeTextPrimary m-0">{title}</h3>
    </div>
    {children}
  </div>
);

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[998] flex items-center justify-center p-4 md:p-8"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal Panel */}
      <div
        className="relative z-10 w-full max-w-2xl max-h-[85vh] rounded-2xl border border-themeBorder/60 bg-themeCard/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-themeBorder/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-themeAccent to-indigo-500 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-themeTextPrimary m-0">Help &amp; Documentation</h2>
              <p className="text-[10px] text-themeTextSecondary m-0">PlacementPrep AI — RAG Placement Hub</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeBg/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Getting Started */}
          <SectionCard icon={<MessageSquare className="w-4 h-4" />} title="How to Use">
            <ul className="space-y-2">
              {[
                { icon: <ChevronRight className="w-3 h-3 text-themeAccent flex-shrink-0" />, text: 'Type your question in the input box and press Enter (or click Send).' },
                { icon: <ChevronRight className="w-3 h-3 text-themeAccent flex-shrink-0" />, text: 'Use the Quick Prompt chips in the sidebar or below the input for starter questions.' },
                { icon: <ChevronRight className="w-3 h-3 text-themeAccent flex-shrink-0" />, text: 'Click the + button to upload a PDF. The AI will answer questions from that document.' },
                { icon: <ChevronRight className="w-3 h-3 text-themeAccent flex-shrink-0" />, text: 'Select any text in an AI reply and click "Quote & Ask" to refine your question.' },
                { icon: <ChevronRight className="w-3 h-3 text-themeAccent flex-shrink-0" />, text: 'Responses stream in real-time — you\'ll see tokens appear as the AI generates them.' },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-themeTextSecondary leading-relaxed">
                  {item.icon}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* Supported Companies */}
          <SectionCard icon={<Building2 className="w-4 h-4" />} title="Supported Companies & Topics">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {['TCS NQT', 'Infosys', 'IBM', 'Wipro', 'Cognizant', 'HR Questions', 'Aptitude', 'DSA Rounds', 'Group Discussion', 'Resume Tips'].map((tag) => (
                <span key={tag} className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-themeAccent/10 border border-themeAccent/25 text-themeAccent">
                  <span className="w-1.5 h-1.5 rounded-full bg-themeAccent" />
                  {tag}
                </span>
              ))}
            </div>
          </SectionCard>

          {/* Keyboard Shortcuts */}
          <SectionCard icon={<Keyboard className="w-4 h-4" />} title="Keyboard Shortcuts">
            <div>
              <ShortcutRow keys={['Enter']} label="Send message" />
              <ShortcutRow keys={['Shift', 'Enter']} label="New line in input" />
              <ShortcutRow keys={['Esc']} label="Close modal / dialog" />
              <ShortcutRow keys={['Ctrl', 'K']} label="Focus input box" />
            </div>
          </SectionCard>

          {/* PDF Upload */}
          <SectionCard icon={<FileText className="w-4 h-4" />} title="PDF Document Mode">
            <ul className="space-y-1.5">
              {[
                'Click the + icon to upload any PDF (max recommended: 20 MB).',
                'The document is chunked, embedded, and stored in a temporary in-memory vector store.',
                'All questions while a PDF is active query ONLY that document.',
                'Use "⚡ Practice Quiz" to auto-generate MCQs from your document.',
                'Sessions expire after 2 hours. Remove with the ✕ button.',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-themeTextSecondary leading-relaxed">
                  <span className="text-themeAccent mt-0.5">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* RAG Pipeline */}
          <SectionCard icon={<Layers className="w-4 h-4" />} title="How the RAG Pipeline Works">
            <div className="space-y-2">
              {[
                { icon: <Search className="w-3.5 h-3.5" />, step: '1. Query Embedding', desc: 'Your question is encoded into a 384-dimensional vector using all-MiniLM-L6-v2.' },
                { icon: <Zap className="w-3.5 h-3.5" />, step: '2. Hybrid Retrieval', desc: 'Pinecone dense cosine search + BM25 keyword search run in parallel.' },
                { icon: <Layers className="w-3.5 h-3.5" />, step: '3. Reciprocal Rank Fusion', desc: 'Dense and sparse rankings are fused using 1/(60+rank) — the best of both worlds.' },
                { icon: <Bot className="w-3.5 h-3.5" />, step: '4. Groq LLM Synthesis', desc: 'llama-3.1-8b-instant on Groq hardware streams a grounded answer from retrieved context.' },
                { icon: <Cpu className="w-3.5 h-3.5" />, step: '5. Eval Scoring', desc: 'Document queries are scored on faithfulness and answer relevance.' },
              ].map(({ icon, step, desc }, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <span className="text-themeAccent mt-0.5 flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-themeTextPrimary m-0">{step}</p>
                    <p className="text-[10px] text-themeTextSecondary m-0 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-themeBorder/40 flex items-center justify-between">
          <span className="text-[10px] text-themeTextSecondary">Press <kbd className="px-1.5 py-0.5 rounded bg-themeBg border border-themeBorder text-[9px] font-mono">Esc</kbd> to close</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-themeTextSecondary border border-themeBorder hover:text-themeTextPrimary hover:bg-themeBg/80 transition-all"
          >
            Got it
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};
