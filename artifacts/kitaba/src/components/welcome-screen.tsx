import { Button } from '@/components/ui/button';
import { BookOpen, FolderOpen } from 'lucide-react';

interface WelcomeScreenProps {
  onNewGame: () => void;
  onLoadGame: () => void;
}

export function WelcomeScreen({ onNewGame, onLoadGame }: WelcomeScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" data-testid="welcome-screen">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="font-serif text-6xl md:text-7xl text-primary tracking-wide" data-testid="text-title">
            KITABA
          </h1>
          <p className="text-foreground/80 text-lg md:text-xl italic font-serif leading-relaxed">
            Une aventure littéraire où chaque mot devient réalité.
            <br />
            Vous êtes l'auteur. Vous êtes le héros.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Button
            onClick={onNewGame}
            size="lg"
            className="w-full sm:w-auto px-8 py-6 text-base"
            data-testid="button-start-new-game"
          >
            <BookOpen className="w-5 h-5 mr-2" />
            Nouvelle partie
          </Button>
          <Button
            onClick={onLoadGame}
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto px-8 py-6 text-base"
            data-testid="button-load-game-welcome"
          >
            <FolderOpen className="w-5 h-5 mr-2" />
            Charger
          </Button>
        </div>

        <div className="pt-12 text-sm text-muted-foreground italic">
          "Le monde attend votre plume."
        </div>
      </div>
    </div>
  );
}
