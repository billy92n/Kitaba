import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SaveGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (saveName: string) => void;
  isLoading?: boolean;
}

export function SaveGameModal({ open, onOpenChange, onSave, isLoading }: SaveGameModalProps) {
  const [saveName, setSaveName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim() || isLoading) return;
    
    onSave(saveName.trim());
    setSaveName('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-save-game">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Sauvegarder la partie</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Donnez un nom à cette sauvegarde pour la retrouver plus tard.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="saveName">Nom de la sauvegarde</Label>
            <Input
              id="saveName"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Ma partie du 12 mars..."
              autoFocus
              disabled={isLoading}
              data-testid="input-save-name"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                setSaveName('');
              }}
              disabled={isLoading}
              data-testid="button-cancel-save"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!saveName.trim() || isLoading}
              data-testid="button-confirm-save"
            >
              {isLoading ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
