// services/gameService.ts â€” Orchestre le traitement complet d'une action.
// SÃ©quence : interprÃ©tation LLM â†’ rÃ©solution moteur â†’ persistance atomique â†’ narration.
// La transaction PostgreSQL garantit l'atomicitÃ© de chaque action.

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  kitabaSessionsTable,
  kitabaEventsTable,
  kitabaSavesTable,
} from "@workspace/db";
import { interpretPlayerAction } from "../llm/interpretAction.js";
import {
  narrateFromPerception,
  generateIntroText,
} from "../llm/narrateResult.js";
import { resolveAction } from "../engine/actionResolver.js";
import { buildPerceptibleFacts } from "../engine/perceptionEngine.js";
import { createSession, loadSession } from "../persistence/worldRepository.js";
import {
  loadSave,
  listManualSaves,
  pruneAutoSaves,
} from "../persistence/saveRepository.js";
import { createInitialWorldState } from "../worldSeed.js";
import { formatWorldDate, getControlledEntity } from "../domain/world.js";
import type { NarrativeEntry, CharacterStatus } from "../persistence/types.js";
import type { WorldState } from "../domain/world.js";
import type { GameEvent } from "../domain/events.js";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildCharacterStatus(state: WorldState): CharacterStatus {
  const entity = getControlledEntity(state);
  const loc = state.locations[entity.locationId];
  return {
    name: entity.name,
    locationName: loc?.name ?? "Inconnu",
    worldDate: formatWorldDate(state.time),
    hunger: Math.round(entity.hunger ?? 100),
    fatigue: Math.round(entity.fatigue ?? 100),
    health: Math.round(entity.health ?? 100),
  };
}

export function bindEventToSession(
  event: GameEvent,
  sessionId: string,
): GameEvent {
  return { ...event, sessionId };
}

export function appendNarrativeEntry(
  history: readonly NarrativeEntry[],
  entry: NarrativeEntry,
): NarrativeEntry[] {
  return [...history, entry];
}

// â”€â”€â”€ Nouvelle partie â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function startNewGame(playerName: string): Promise<{
  sessionId: string;
  characterStatus: CharacterStatus;
  narrativeHistory: NarrativeEntry[];
}> {
  const worldState = createInitialWorldState(playerName.trim());
  const introText = generateIntroText(worldState);

  const introEntry: NarrativeEntry = {
    id: randomUUID(),
    type: "system",
    text: introText,
    timestamp: new Date().toISOString(),
  };

  const narrativeHistory: NarrativeEntry[] = [introEntry];
  const sessionId = await createSession(
    worldState.controlledEntityId,
    worldState,
    narrativeHistory,
  );

  return {
    sessionId,
    characterStatus: buildCharacterStatus(worldState),
    narrativeHistory,
  };
}

// â”€â”€â”€ Traitement d'une action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function processPlayerAction(
  sessionId: string,
  playerInput: string,
): Promise<{
  narrativeEntry: NarrativeEntry;
  characterStatus: CharacterStatus;
  worldVersion: number;
} | null> {
  // Charge l'Ã©tat â€” la vÃ©ritÃ© du monde est toujours en base
  const session = await loadSession(sessionId);
  if (!session) return null;

  const { worldState, narrativeHistory } = session;

  // 1. InterprÃ©tation (faux LLM) â€” ne reÃ§oit que le texte brut
  const action = interpretPlayerAction(playerInput.trim());

  // 2. RÃ©solution moteur â€” ne touche pas au langage naturel
  const actorId = worldState.controlledEntityId;
  const resolved = resolveAction(worldState, actorId, action);
  const event = bindEventToSession(resolved.event, sessionId);

  // 3. Construction des faits perceptibles â€” filtre l'Ã©tat du monde
  const perception = buildPerceptibleFacts(
    resolved.newWorldState,
    actorId,
    resolved.actionOutcome,
  );
  if (!perception.success) return null;

  // 4. Narration â€” ne reÃ§oit que les faits perceptibles
  const narrationText = narrateFromPerception(perception.facts);

  const narrativeEntry: NarrativeEntry = {
    id: randomUUID(),
    type: "narrator",
    text: narrationText,
    timestamp: new Date().toISOString(),
  };
  const updatedNarrativeHistory = appendNarrativeEntry(
    narrativeHistory,
    narrativeEntry,
  );

  const newWorldState = resolved.newWorldState;

  // 5. Persistance atomique dans une transaction PostgreSQL
  await db.transaction(async (tx) => {
    // Met Ã  jour la session
    await tx
      .update(kitabaSessionsTable)
      .set({
        worldVersion: newWorldState.worldVersion,
        worldState: newWorldState,
        narrativeHistory: updatedNarrativeHistory,
        updatedAt: new Date(),
      })
      .where(eq(kitabaSessionsTable.id, sessionId));

    // Persiste l'Ã©vÃ©nement dans le journal immuable
    await tx.insert(kitabaEventsTable).values({
      id: event.id,
      sessionId,
      worldVersion: event.worldVersion,
      actionType: event.actionType,
      actorId: event.actorId,
      locationId: event.locationId,
      targetId: event.targetId ?? null,
      description: event.description,
      consequences: event.consequences,
      occurredAt: event.occurredAt,
    });

    // Une tentative refusÃ©e reste Ã  la mÃªme worldVersion, mais son UUID de
    // sauvegarde et son entrÃ©e narrative sont uniques : elle demeure auditable
    // sans prÃ©tendre reprÃ©senter une nouvelle version du monde.
    const autoSaveName = `auto-v${newWorldState.worldVersion}`;
    await tx.insert(kitabaSavesTable).values({
      id: randomUUID(),
      sessionId,
      parentSessionId: null,
      saveType: "auto",
      saveName: autoSaveName,
      controlledEntityId: newWorldState.controlledEntityId,
      worldVersion: newWorldState.worldVersion,
      worldState: newWorldState,
      narrativeHistory: updatedNarrativeHistory,
    });
  });

  // Nettoyage des auto-saves anciennes (hors transaction, non critique)
  pruneAutoSaves(sessionId, 10).catch(() => {});

  return {
    narrativeEntry,
    characterStatus: buildCharacterStatus(newWorldState),
    worldVersion: newWorldState.worldVersion,
  };
}

// â”€â”€â”€ Sauvegarde manuelle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function saveGame(
  sessionId: string,
  saveName: string,
): Promise<{
  saveId: string;
  saveName: string;
  savedAt: string;
} | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;

  const saveId = randomUUID();
  const savedAt = new Date();
  await db.insert(kitabaSavesTable).values({
    id: saveId,
    sessionId,
    parentSessionId: sessionId,
    saveType: "manual",
    saveName,
    controlledEntityId: session.controlledEntityId,
    worldVersion: session.worldState.worldVersion,
    worldState: session.worldState,
    narrativeHistory: session.narrativeHistory,
    savedAt,
  });
  return {
    saveId,
    saveName,
    savedAt: savedAt.toISOString(),
  };
}

// â”€â”€â”€ Chargement d'une sauvegarde â€” crÃ©e une nouvelle branche â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function loadSavedGame(saveId: string): Promise<{
  sessionId: string;
  characterStatus: CharacterStatus;
  narrativeHistory: NarrativeEntry[];
} | null> {
  const save = await loadSave(saveId);
  if (!save) return null;

  // CrÃ©e une nouvelle session â€” l'ancienne reste intacte (branchement)
  const newSessionId = await createSession(
    save.controlledEntityId,
    save.worldState,
    save.narrativeHistory,
  );

  return {
    sessionId: newSessionId,
    characterStatus: buildCharacterStatus(save.worldState),
    narrativeHistory: save.narrativeHistory,
  };
}

// â”€â”€â”€ Liste des sauvegardes manuelles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getManualSaves() {
  const saves = await listManualSaves();
  return saves.map((s) => ({
    saveId: s.id,
    saveName: s.saveName,
    characterName: s.worldState.entities[s.controlledEntityId]?.name ?? "?",
    worldVersion: s.worldVersion,
    savedAt: s.savedAt,
  }));
}

