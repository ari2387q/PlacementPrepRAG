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
  { step: 'Query Prep', detail: 'Tokenize, normalize and route the question to the right retriever.', status: 'completed', durationMs: 12 },
  { step: 'Pinecone Vector Search', detail: 'Embed query and perform cosine search over the vector index.', status: 'completed', durationMs: 142 },
  { step: 'BM25 Keyword Search', detail: 'Exact-match sparse retrieval across indexed document chunks.', status: 'completed', durationMs: 18 },
  { step: 'Reciprocal Rank Fusion', detail: 'Merge dense and sparse rankings into a single candidate list.', status: 'completed', durationMs: 6 },
  { step: '2-Stage Custom Reranker', detail: 'Rescore top candidates with bigram overlap and position boosting.', status: 'completed', durationMs: 9 },
  { step: 'Groq LLM Synthesizer', detail: 'Generate the final answer using grounded context and conversation history.', status: 'completed', durationMs: 410 },
];

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ stages = DEFAULT_STAGES, queryText }) => {
  const [isOpen, setIsOpen] = useState(false);
  const totalDuration = stages.reduce((acc, s) => acc + s.durationMs, 0);
  const STAGE_ICONS = [Cpu, Database, Search, GitMerge, Sliders, MessageSquare];

  return (
    <div className="mt-4 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-[0_32px_80px_-40px_rgba(124,58,237,0.45)] transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-slate-100 hover:bg-slate-900/80 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br from-violet-500/15 to-cyan-400/10 text-cyan-200 shadow-lg shadow-cyan-500/10">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300 font-semibold">Inspect RAG Pipeline</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">Hybrid retrieval flow with dense + sparse fusion</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1">
            <Clock className="h-3.5 w-3.5 text-cyan-300" />
            {totalDuration}ms
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-3 py-1 text-violet-200">
            {stages.length} stages
          </span>
          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-white/10 bg-slate-950/90 px-4 py-5 space-y-4">
          {queryText && (
            <div className="rounded-[1.5rem] border border-violet-500/15 bg-violet-500/5 px-4 py-3 text-sm text-slate-100">
              <span className="font-semibold text-cyan-200">Query:</span>{' '}
              <span className="text-slate-200">{queryText.length > 96 ? `${queryText.slice(0, 96)}...` : queryText}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((stage, idx) => {
              const IconComponent = STAGE_ICONS[idx % STAGE_ICONS.length];
              return (
                <div
                  key={idx}
                  className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.7)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-slate-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br from-violet-500/15 to-cyan-400/10 text-cyan-200 shadow-sm shadow-cyan-500/10">
                        <IconComponent className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">{stage.step}</p>
                        <p className="mt-1 text-[13px] leading-5 text-slate-400">{stage.detail}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold text-slate-300 border border-white/10">
                      {stage.durationMs}ms
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-[12px] text-slate-400 shadow-inner shadow-slate-950/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium text-slate-200">Dense Pinecone + Sparse BM25 → fused with RRF</span>
            <span className="inline-flex items-center rounded-full bg-slate-950/60 px-3 py-1 text-[11px] text-cyan-300">
              Rerank → Final answer
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
