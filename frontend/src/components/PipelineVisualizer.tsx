import React, { useState } from 'react';
import { Cpu, Database, Search, GitMerge, Sliders, MessageSquare, ChevronDown, ChevronUp, Zap, Clock } from 'lucide-react';

export interface PipelineStage {
  step: string;
  detail: string;
  status: 'completed' | 'processing' | 'pending';
  durationMs: number;
}

interface PipelineVisualizerProps {
  stages?: PipelineStage[];
  queryText?: string;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { step: 'Query Prep', detail: 'Tokenized terms & company metadata extracted', status: 'completed', durationMs: 12 },
  { step: 'Pinecone Vector Search', detail: '384-dim SentenceTransformer embedding -> Cosine similarity top 15', status: 'completed', durationMs: 142 },
  { step: 'BM25 Keyword Search', detail: 'Exact term frequency matching across document index top 15', status: 'completed', durationMs: 18 },
  { step: 'Reciprocal Rank Fusion', detail: 'Merged ranked candidates with score formula 1 / (60 + rank)', status: 'completed', durationMs: 6 },
  { step: '2-Stage Custom Reranker', detail: 'Bigram overlap + position boost rescoring -> Top 5 selected', status: 'completed', durationMs: 9 },
  { step: 'Groq LLM Synthesizer', detail: 'llama-3.1-8b-instant grounded response generated', status: 'completed', durationMs: 410 },
];

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ stages = DEFAULT_STAGES }) => {
  const [isOpen, setIsOpen] = useState(false);

  const totalDuration = stages.reduce((acc, s) => acc + s.durationMs, 0);

  const STAGE_ICONS = [
    Cpu,
    Database,
    Search,
    GitMerge,
    Sliders,
    MessageSquare
  ];

  return (
    <div className="mt-2.5 rounded-xl bg-themeBg/40 border border-themeBorder/60 overflow-hidden text-xs transition-all">
      {/* Toggle Button Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-themeTextSecondary hover:text-themeTextPrimary hover:bg-themeBg/60 transition-colors select-none"
      >
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-amber-400/90 uppercase tracking-wider">Inspect RAG Pipeline</span>
          <span className="text-themeBorder">|</span>
          <span className="flex items-center gap-1 text-themeTextSecondary">
            <Clock className="w-3 h-3" />
            {totalDuration}ms total
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-semibold">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            6 Stages Fused
          </span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expandable Flowchart Timeline */}
      {isOpen && (
        <div className="p-4 border-t border-themeBorder/50 bg-themeSidebar/50 space-y-3 animate-fadeIn">
          <div className="text-[10px] text-themeTextSecondary uppercase font-bold tracking-widest mb-2">
            Execution Flowchart (Dense + Sparse Hybrid RAG)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {stages.map((stage, idx) => {
              const IconComponent = STAGE_ICONS[idx % STAGE_ICONS.length];
              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-themeCard border border-themeBorder/70 flex flex-col justify-between hover:border-themeAccent/40 transition-all shadow-sm group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-themeAccent/15 text-themeAccent border border-themeAccent/30 flex items-center justify-center font-mono text-[10px] font-bold">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-themeTextPrimary text-[11px] truncate max-w-[130px]">
                        {stage.step}
                      </span>
                    </div>

                    <span className="font-mono text-[9px] text-themeAccent px-1.5 py-0.5 rounded bg-themeBg border border-themeBorder">
                      {stage.durationMs}ms
                    </span>
                  </div>

                  <p className="text-[10px] text-themeTextSecondary leading-normal line-clamp-2">
                    {stage.detail}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Diagram connector visual summary */}
          <div className="pt-2 border-t border-themeBorder/40 flex items-center justify-between text-[10px] text-themeTextSecondary font-mono">
            <span>Dense Pinecone (15) + Sparse BM25 (15)</span>
            <span className="text-themeAccent">→ RRF Fusion (30) → Rerank Top 5 → LLM</span>
          </div>
        </div>
      )}
    </div>
  );
};
