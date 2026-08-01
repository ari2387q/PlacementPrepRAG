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

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ stages, queryText }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!stages || stages.length === 0) return null;
  
  const totalDuration = stages.reduce((acc, s) => acc + s.durationMs, 0);
  const STAGE_ICONS = [Cpu, Database, Search, GitMerge, Sliders, MessageSquare];

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/80 shadow-sm transition-all duration-300 max-w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-slate-100 hover:bg-slate-900/80 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Zap className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">RAG Pipeline</span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-cyan-400/80" />
            {totalDuration}ms
          </span>
          <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/80">
            {stages.length} steps
          </span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-white/10 bg-slate-900/50 p-2 space-y-1.5">
          {stages.map((stage, idx) => {
            const IconComponent = STAGE_ICONS[idx % STAGE_ICONS.length];
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <IconComponent className="h-3.5 w-3.5 text-cyan-300/70 flex-shrink-0" />
                  <div className="truncate">
                    <p className="text-[11px] font-medium text-slate-200 truncate">{stage.step}</p>
                    <p className="text-[9px] text-slate-400 truncate">{stage.detail}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-cyan-200 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-500/20 whitespace-nowrap">
                  {stage.durationMs}ms
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
