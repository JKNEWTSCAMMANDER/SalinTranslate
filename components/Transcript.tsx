
import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptProps {
  entries: TranscriptEntry[];
}

const Transcript: React.FC<TranscriptProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [entries]);

  // Only show Salin's translations (model role)
  const translations = entries.filter(entry => entry.role === 'model');

  if (translations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-700 p-8 text-center">
        <div className="w-10 h-10 rounded-full border border-slate-800/50 flex items-center justify-center mb-3 opacity-20">
          <i className="fas fa-quote-left text-[10px]"></i>
        </div>
        <p className="text-[8px] uppercase tracking-[0.5em] font-black opacity-20 leading-loose">
          Awaiting translation...
        </p>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6 flex flex-col space-y-6 scroll-smooth no-scrollbar"
    >
      {translations.map((entry, idx) => (
        <div 
          key={entry.timestamp + idx}
          className="w-full flex justify-center animate-[fadeIn_0.5s_ease-out]"
        >
          <div className="w-full max-w-sm text-center">
            <p className="text-[15px] font-medium leading-relaxed text-indigo-100/90 tracking-wide selection:bg-indigo-500/30">
              {entry.text}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 opacity-10">
              <div className="h-[1px] w-4 bg-white"></div>
              <span className="text-[6px] font-black uppercase tracking-[0.3em]">Salin</span>
              <div className="h-[1px] w-4 bg-white"></div>
            </div>
          </div>
        </div>
      ))}
      <div className="h-12 w-full shrink-0"></div> {/* Spacer for bottom scroll */}
    </div>
  );
};

export default Transcript;
