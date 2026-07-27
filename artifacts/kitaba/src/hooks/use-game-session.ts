import { useState, useCallback } from 'react';
import type { CharacterStatus, NarrativeEntry } from '@workspace/api-client-react';

export interface GameSession {
  sessionId: string | null;
  characterStatus: CharacterStatus | null;
  narrativeHistory: NarrativeEntry[];
}

export function useGameSession() {
  const [session, setSession] = useState<GameSession>({
    sessionId: null,
    characterStatus: null,
    narrativeHistory: [],
  });

  const initializeSession = useCallback((
    sessionId: string,
    characterStatus: CharacterStatus,
    narrativeHistory: NarrativeEntry[]
  ) => {
    setSession({
      sessionId,
      characterStatus,
      narrativeHistory,
    });
  }, []);

  const addNarrativeEntry = useCallback((entry: NarrativeEntry) => {
    setSession((prev) => ({
      ...prev,
      narrativeHistory: [...prev.narrativeHistory, entry],
    }));
  }, []);

  const updateCharacterStatus = useCallback((characterStatus: CharacterStatus) => {
    setSession((prev) => ({
      ...prev,
      characterStatus,
    }));
  }, []);

  const clearSession = useCallback(() => {
    setSession({
      sessionId: null,
      characterStatus: null,
      narrativeHistory: [],
    });
  }, []);

  return {
    session,
    initializeSession,
    addNarrativeEntry,
    updateCharacterStatus,
    clearSession,
  };
}
