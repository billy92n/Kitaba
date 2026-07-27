import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface NewGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartGame: (playerName: string) => void;
  isLoading?: boolean;
}

export function NewGameModal({ open, onOpenChange, onStartGame, isLoading }: NewGameModalProps) {
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isLoading) return;
    
    onStartGame(playerName.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-new-game">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Nouvelle partie</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Entrez le nom de votre personnage pour commencer votre aventure.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playerName">Nom du personnage</Label>
            <Input
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Entrez un nom..."
              autoFocus
              disabled={isLoading}
              data-testid="input-player-name"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              data-testid="button-cancel-new-game"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!playerName.trim() || isLoading}
              data-testid="button-confirm-new-game"
            >
              {isLoading ? 'Création...' : 'Commencer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
