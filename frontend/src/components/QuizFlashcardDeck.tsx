import React, { useState } from 'react';
import { Sparkles, HelpCircle, Layers, CheckCircle2, XCircle, RotateCcw, ChevronRight, ChevronLeft, Eye, X, BookOpen } from 'lucide-react';

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  conceptTag: string;
}

interface QuizFlashcardDeckProps {
  filename: string;
  sessionId: string;
  items?: QuizItem[] | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onClose: () => void;
}

const DEFAULT_QUIZ_ITEMS: QuizItem[] = [
  {
    id: '1',
    question: 'What is the primary role of Reciprocal Rank Fusion (RRF) in a hybrid search RAG pipeline?',
    options: [
      'To compress document embeddings before storing in Pinecone',
      'To combine and normalize ranked lists from vector search and BM25 search',
      'To generate synthetic test questions for the candidate',
      'To encrypt private user tokens before transmission'
    ],
    correctAnswer: 1,
    explanation: 'RRF calculates combined scores based on candidate ranks from dense vector search and sparse BM25 search using formula 1 / (k + rank).',
    conceptTag: 'Search Engineering'
  },
  {
    id: '2',
    question: 'In campus placement technical interviews, what is the time complexity of searching in a balanced Binary Search Tree (BST)?',
    options: ['O(1)', 'O(N)', 'O(log N)', 'O(N log N)'],
    correctAnswer: 2,
    explanation: 'A balanced BST guarantees search operations in O(log N) time as half the remaining tree is eliminated at each comparison.',
    conceptTag: 'Data Structures'
  },
  {
    id: '3',
    question: 'What is the key advantage of a 2-stage custom reranker over single vector search?',
    options: [
      'It reduces RAM usage during document chunking',
      'It rescores top candidate chunks using exact term overlap, bigrams, and position boosting',
      'It eliminates the need for any LLM prompt evaluation',
      'It automatically translates questions to multiple languages'
    ],
    correctAnswer: 1,
    explanation: 'A custom reranker fine-tunes top fused candidates by matching exact phrase bigrams and boosting early position occurrences in documents.',
    conceptTag: 'RAG Optimization'
  },
  {
    id: '4',
    question: 'During HR interviews, how should candidates structure answers to behavioral questions?',
    options: [
      'Using the STAR Method (Situation, Task, Action, Result)',
      'By giving single-word yes/no answers',
      'By only describing theoretical definitions',
      'By criticizing past project teammates'
    ],
    correctAnswer: 0,
    explanation: 'The STAR framework provides a clear, structured story demonstrating real problem-solving impact in technical and HR rounds.',
    conceptTag: 'HR Round Prep'
  }
];

export const QuizFlashcardDeck: React.FC<QuizFlashcardDeckProps> = ({ filename, items, isLoading, errorMessage, onRetry, onClose }) => {
  const [mode, setMode] = useState<'quiz' | 'flashcard'>('quiz');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<number, { chosen: number; correct: boolean }>>({});
  const [isFlipped, setIsFlipped] = useState(false);
  const quizItems = items && items.length > 0 ? items : DEFAULT_QUIZ_ITEMS;

  const [prevItems, setPrevItems] = useState(items);

  if (items !== prevItems) {
    setPrevItems(items);
    setCurrentIndex(0);
    setScore(0);
    setAnsweredMap({});
    setIsFlipped(false);
  }

  const currentItem = quizItems[currentIndex];

  const handleSelectOption = (optionIndex: number) => {
    if (answeredMap[currentIndex] !== undefined) return;

    const isCorrect = optionIndex === currentItem.correctAnswer;
    if (isCorrect) setScore(prev => prev + 1);

    setAnsweredMap(prev => ({
      ...prev,
      [currentIndex]: { chosen: optionIndex, correct: isCorrect }
    }));
  };

  const handleNext = () => {
    if (currentIndex < quizItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setScore(0);
    setAnsweredMap({});
    setIsFlipped(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50/90 border-b border-slate-200 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-themeAccent/15 border border-themeAccent/30 flex items-center justify-center text-themeAccent">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
              <span>Interactive Quiz & Flashcard Deck</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-themeAccent/15 text-themeAccent border border-themeAccent/30 truncate max-w-[200px]">
                {filename}
              </span>
            </h3>
            <p className="text-xs text-slate-600 m-0">Test your knowledge on uploaded material</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Switcher Buttons */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
            <button
              onClick={() => { setMode('quiz'); setIsFlipped(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'quiz' ? 'bg-themeAccent text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Quiz
            </button>
            <button
              onClick={() => { setMode('flashcard'); setIsFlipped(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'flashcard' ? 'bg-themeAccent text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Flashcard
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Close quiz panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Deck Container */}
      <div className="p-6 space-y-5">
        {/* Loading / Error Banner */}
        {isLoading && (
          <div className="rounded-2xl border border-themeAccent/30 bg-themeAccent/10 px-4 py-3 text-xs font-semibold text-themeAccent">
            Generating quiz items from your uploaded document...
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
            <div className="flex items-center justify-between gap-4">
              <span>{errorMessage}</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs font-bold uppercase tracking-wider text-themeAccent hover:underline"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1.5 font-mono text-xs">
            <BookOpen className="w-4 h-4 text-themeAccent" />
            Card {currentIndex + 1} of {quizItems.length}
          </span>

          <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-semibold">
            {currentItem.conceptTag}
          </span>

          {mode === 'quiz' && (
            <span className="text-emerald-800 font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              Score: {score} / {Object.keys(answeredMap).length}
            </span>
          )}
        </div>

        {/* QUIZ MODE */}
        {mode === 'quiz' && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 leading-relaxed shadow-xs">
              {currentItem.question}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {currentItem.options.map((opt, idx) => {
                const answerState = answeredMap[currentIndex];
                const isChosen = answerState?.chosen === idx;
                const isCorrectOpt = idx === currentItem.correctAnswer;
                
                let btnStyle = "bg-white border-slate-200 text-slate-800 hover:border-themeAccent hover:bg-slate-50 font-medium shadow-xs";
                
                if (answerState !== undefined) {
                  if (isCorrectOpt) {
                    btnStyle = "bg-emerald-50 border-2 border-emerald-500 text-emerald-950 font-bold shadow-xs";
                  } else if (isChosen && !answerState.correct) {
                    btnStyle = "bg-rose-50 border-2 border-rose-500 text-rose-950 font-bold shadow-xs";
                  } else {
                    btnStyle = "bg-slate-50 border-slate-200 text-slate-500 opacity-60";
                  }
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    disabled={answerState !== undefined}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-xs transition-all flex items-start gap-3 ${btnStyle}`}
                  >
                    <span className="w-5 h-5 rounded-md border border-current/40 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1 text-xs leading-relaxed">{opt}</span>
                    {answerState !== undefined && isCorrectOpt && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    )}
                    {answerState !== undefined && isChosen && !answerState.correct && (
                      <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation card */}
            {answeredMap[currentIndex] !== undefined && (
              <div className="p-4 rounded-2xl bg-purple-50/90 border border-purple-200 text-xs text-purple-950 leading-relaxed shadow-xs">
                <span className="font-bold block mb-1 text-purple-900">💡 Explanation:</span>
                {currentItem.explanation}
              </div>
            )}
          </div>
        )}

        {/* FLASHCARD MODE */}
        {mode === 'flashcard' && (
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="w-full min-h-[200px] p-8 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center cursor-pointer shadow-xs transition-all duration-300 hover:border-themeAccent group relative"
          >
            <span className="absolute top-3 right-3 text-[10px] font-mono text-slate-600 flex items-center gap-1 bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
              <Eye className="w-3 h-3 text-themeAccent" />
              Click card to flip
            </span>

            {!isFlipped ? (
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-themeAccent">Question</span>
                <p className="text-base font-bold text-slate-900 leading-relaxed max-w-lg">
                  {currentItem.question}
                </p>
              </div>
            ) : (
              <div className="space-y-3 animate-fadeIn">
                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700">Answer & Key Concept</span>
                <p className="text-base font-extrabold text-emerald-950">
                  {currentItem.options[currentItem.correctAnswer]}
                </p>
                <p className="text-xs text-slate-700 max-w-md pt-3 border-t border-slate-200 leading-relaxed">
                  {currentItem.explanation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Quiz
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === quizItems.length - 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-themeAccent hover:bg-themeAccentHover text-white text-xs font-bold disabled:opacity-30 transition-all shadow-sm active:scale-95"
            >
              Next Card
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
