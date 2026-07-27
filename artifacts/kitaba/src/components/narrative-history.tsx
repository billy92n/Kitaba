import { useEffect, useRef, useState } from 'react';
import type { NarrativeEntry } from '@workspace/api-client-react';

interface NarrativeHistoryProps {
  entries: NarrativeEntry[];
  isLoading?: boolean;
}

export function NarrativeHistory({ entries, isLoading }: NarrativeHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    if (!scrollRef.current || userHasScrolled) return;
    
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, userHasScrolled]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (scrollTop < lastScrollTop.current) {
      setUserHasScrolled(true);
    }
    
    if (isAtBottom) {
      setUserHasScrolled(false);
    }
    
    lastScrollTop.current = scrollTop;
  };

  return (
    <div 
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto narrative-scroll px-6 py-8"
      data-testid="narrative-history"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {entries.map((entry) => {
          if (entry.type === 'system') {
            return (
              <div 
                key={entry.id} 
                className="text-center italic text-muted-foreground text-sm py-4"
                data-testid={`entry-system-${entry.id}`}
              >
                {entry.text}
              </div>
            );
          }

          if (entry.type === 'player') {
            return (
              <div 
                key={entry.id} 
                className="flex justify-end"
                data-testid={`entry-player-${entry.id}`}
              >
                <div className="max-w-[85%] bg-accent/30 border border-accent/50 rounded px-4 py-3">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {entry.text}
                  </p>
                </div>
              </div>
            );
          }

          if (entry.type === 'narrator') {
            return (
              <div 
                key={entry.id} 
                className="flex justify-start"
                data-testid={`entry-narrator-${entry.id}`}
              >
                <div className="max-w-[90%]">
                  <p className="font-serif text-foreground/95 leading-relaxed text-[15px] whitespace-pre-wrap">
                    {entry.text}
                  </p>
                </div>
              </div>
            );
          }

          return null;
        })}

        {isLoading && (
          <div className="flex justify-start" data-testid="loading-indicator">
            <div className="flex gap-1.5 items-center px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-soft" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-soft" style={{ animationDelay: '200ms' }}></span>
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-soft" style={{ animationDelay: '400ms' }}></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
