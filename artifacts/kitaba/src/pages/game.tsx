import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useNewGame, 
  useSubmitAction, 
  useSaveGame, 
  useLoadGame,
  getListSavesQueryKey 
} from '@workspace/api-client-react';
import { useGameSession } from '@/hooks/use-game-session';
import { CharacterStatusBar } from '@/components/character-status-bar';
import { NarrativeHistory } from '@/components/narrative-history';
import { ActionInput } from '@/components/action-input';
import { NewGameModal } from '@/components/new-game-modal';
import { SaveGameModal } from '@/components/save-game-modal';
import { LoadGameModal } from '@/components/load-game-modal';
import { WelcomeScreen } from '@/components/welcome-screen';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Save, FolderOpen } from 'lucide-react';

export default function Game() {
  const { session, initializeSession, addNarrativeEntry, updateCharacterStatus, clearSession } = useGameSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  const newGameMutation = useNewGame();
  const submitActionMutation = useSubmitAction();
  const saveGameMutation = useSaveGame();
  const loadGameMutation = useLoadGame();

  const handleNewGame = (playerName: string) => {
    newGameMutation.mutate(
      { data: { playerName } },
      {
        onSuccess: (response) => {
          initializeSession(
            response.sessionId,
            response.characterStatus,
            response.narrativeHistory
          );
          setShowNewGameModal(false);
          
          if (response.introText) {
            toast({
              title: 'Bienvenue',
              description: response.introText,
            });
          }
        },
        onError: () => {
          toast({
            title: 'Erreur',
            description: 'Impossible de démarrer une nouvelle partie.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleSubmitAction = (playerInput: string) => {
    if (!session.sessionId) return;

    const optimisticEntry = {
      id: `temp-${Date.now()}`,
      type: 'player' as const,
      text: playerInput,
      timestamp: new Date().toISOString(),
    };
    
    addNarrativeEntry(optimisticEntry);

    submitActionMutation.mutate(
      { data: { sessionId: session.sessionId, playerInput } },
      {
        onSuccess: (response) => {
          addNarrativeEntry(response.narrativeEntry);
          updateCharacterStatus(response.characterStatus);
        },
        onError: () => {
          toast({
            title: 'Erreur',
            description: "L'action n'a pas pu être traitée.",
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleSaveGame = (saveName: string) => {
    if (!session.sessionId) return;

    saveGameMutation.mutate(
      { data: { sessionId: session.sessionId, saveName } },
      {
        onSuccess: (response) => {
          queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
          
          const systemEntry = {
            id: `save-${Date.now()}`,
            type: 'system' as const,
            text: `Partie sauvegardée : ${response.saveName}`,
            timestamp: new Date().toISOString(),
          };
          addNarrativeEntry(systemEntry);
          
          setShowSaveModal(false);
          toast({
            title: 'Sauvegarde réussie',
            description: `Votre partie a été sauvegardée sous "${response.saveName}".`,
          });
        },
        onError: () => {
          toast({
            title: 'Erreur',
            description: 'Impossible de sauvegarder la partie.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleLoadGame = (saveId: string) => {
    loadGameMutation.mutate(
      { data: { saveId } },
      {
        onSuccess: (response) => {
          initializeSession(
            response.sessionId,
            response.characterStatus,
            response.narrativeHistory
          );
          setShowLoadModal(false);
          
          toast({
            title: 'Partie chargée',
            description: `Bienvenue, ${response.characterStatus.name}.`,
          });
        },
        onError: () => {
          toast({
            title: 'Erreur',
            description: 'Impossible de charger cette sauvegarde.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleNewGameClick = () => {
    if (session.sessionId) {
      const confirmed = window.confirm(
        'Commencer une nouvelle partie effacera votre progression actuelle. Voulez-vous continuer ?'
      );
      if (!confirmed) return;
      clearSession();
    }
    setShowNewGameModal(true);
  };

  if (!session.sessionId) {
    return (
      <>
        <WelcomeScreen
          onNewGame={handleNewGameClick}
          onLoadGame={() => setShowLoadModal(true)}
        />
        <NewGameModal
          open={showNewGameModal}
          onOpenChange={setShowNewGameModal}
          onStartGame={handleNewGame}
          isLoading={newGameMutation.isPending}
        />
        <LoadGameModal
          open={showLoadModal}
          onOpenChange={setShowLoadModal}
          onLoad={handleLoadGame}
          isLoadingGame={loadGameMutation.isPending}
        />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col" data-testid="game-screen">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <h1 className="font-serif text-3xl text-primary tracking-wide" data-testid="text-game-title">
            KITABA
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNewGameClick}
              data-testid="button-new-game"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Nouvelle partie
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSaveModal(true)}
              data-testid="button-save-game"
            >
              <Save className="w-4 h-4 mr-2" />
              Sauvegarder
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowLoadModal(true)}
              data-testid="button-load-game"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Charger
            </Button>
          </div>
        </div>
      </div>

      {session.characterStatus && (
        <CharacterStatusBar status={session.characterStatus} />
      )}

      <NarrativeHistory
        entries={session.narrativeHistory}
        isLoading={submitActionMutation.isPending}
      />

      <ActionInput
        onSubmit={handleSubmitAction}
        disabled={submitActionMutation.isPending}
      />

      <NewGameModal
        open={showNewGameModal}
        onOpenChange={setShowNewGameModal}
        onStartGame={handleNewGame}
        isLoading={newGameMutation.isPending}
      />

      <SaveGameModal
        open={showSaveModal}
        onOpenChange={setShowSaveModal}
        onSave={handleSaveGame}
        isLoading={saveGameMutation.isPending}
      />

      <LoadGameModal
        open={showLoadModal}
        onOpenChange={setShowLoadModal}
        onLoad={handleLoadGame}
        isLoadingGame={loadGameMutation.isPending}
      />
    </div>
  );
}
