import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActionInputProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
}

export function ActionInput({ onSubmit, disabled }: ActionInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    
    onSubmit(input.trim());
    setInput('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-card/50 px-6 py-4" data-testid="action-input">
      <div className="max-w-3xl mx-auto flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Que faites-vous ?"
          disabled={disabled}
          className="flex-1 bg-background border border-input rounded px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none overflow-y-auto min-h-[48px] max-h-[120px]"
          rows={1}
          data-testid="textarea-action-input"
        />
        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || disabled}
          className="h-12 px-5"
          data-testid="button-send-action"
        >
          <Send className="w-4 h-4 mr-2" />
          Envoyer
        </Button>
      </div>
    </div>
  );
}
