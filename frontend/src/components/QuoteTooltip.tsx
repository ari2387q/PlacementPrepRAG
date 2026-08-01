import React, { useEffect, useState } from 'react';
import { Quote, MessageSquarePlus } from 'lucide-react';

interface QuoteTooltipProps {
  onQuote: (selectedText: string) => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

export const QuoteTooltip: React.FC<QuoteTooltipProps> = ({ onQuote, containerRef }) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setPosition(null);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        setPosition(null);
        return;
      }

      // Check if selection is within container
      if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
        setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setPosition({
        top: rect.top - 42,
        left: rect.left + rect.width / 2,
      });
      setSelectedText(text);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [containerRef]);

  if (!position || !selectedText) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: `${Math.max(10, position.top)}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 9999,
      }}
      className="animate-bounce-short"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onQuote(selectedText);
          window.getSelection()?.removeAllRanges();
          setPosition(null);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-themeAccent hover:bg-themeAccentHover text-white shadow-xl border border-white/20 text-xs font-bold transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur"
      >
        <Quote className="w-3.5 h-3.5" />
        <span>Quote & Ask</span>
        <MessageSquarePlus className="w-3.5 h-3.5 opacity-80" />
      </button>
    </div>
  );
};
