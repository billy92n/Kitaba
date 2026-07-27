import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useListSaves } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface LoadGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (saveId: string) => void;
  isLoadingGame?: boolean;
}

export function LoadGameModal({ open, onOpenChange, onLoad, isLoadingGame }: LoadGameModalProps) {
  const { data: saveList, isLoading } = useListSaves();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col" data-testid="modal-load-game">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Charger une partie</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Sélectionnez une sauvegarde pour continuer votre aventure.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : saveList?.saves && saveList.saves.length > 0 ? (
            <div className="space-y-2">
              {saveList.saves.map((save) => (
                <button
                  key={save.saveId}
                  onClick={() => onLoad(save.saveId)}
                  disabled={isLoadingGame}
                  className="w-full text-left p-4 rounded border border-border bg-card hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-load-save-${save.saveId}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-serif text-lg text-foreground">{save.saveName}</h3>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(save.savedAt), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {save.characterName}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Aucune sauvegarde disponible.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-border -mx-6 px-6">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isLoadingGame}
            data-testid="button-close-load-modal"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
