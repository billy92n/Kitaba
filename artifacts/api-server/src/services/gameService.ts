// services/gameService.ts — Orchestre le traitement complet d'une action.
// Séquence : interprétation LLM → résolution moteur → persistance atomique → narration.
// La transaction PostgreSQL garantit l'atomicité de chaque action.

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Nouvelle partie ──────────────────────────────────────────────────────────

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

// ─── Traitement d'une action ──────────────────────────────────────────────────

export async function processPlayerAction(
  sessionId: string,
  playerInput: string,
): Promise<{
  narrativeEntry: NarrativeEntry;
  characterStatus: CharacterStatus;
  worldVersion: number;
} | null> {
  // Charge l'état — la vérité du monde est toujours en base
  const session = await loadSession(sessionId);
  if (!session) return null;

  const { worldState, narrativeHistory } = session;

  // 1. Interprétation (faux LLM) — ne reçoit que le texte brut
  const action = interpretPlayerAction(playerInput.trim());

  // 2. Résolution moteur — ne touche pas au langage naturel
  const actorId = worldState.controlledEntityId;
  const resolved = resolveAction(worldState, actorId, action);
  resolved.event.sessionId = sessionId;

  // 3. Construction des faits perceptibles — filtre l'état du monde
  const perception = buildPerceptibleFacts(
    resolved.newWorldState,
    actorId,
    resolved.actionOutcome,
  );
  if (!perception.success) return null;

  // 4. Narration — ne reçoit que les faits perceptibles
  const narrationText = narrateFromPerception(perception.facts);

  const narrativeEntry: NarrativeEntry = {
    id: randomUUID(),
    type: "narrator",
    text: narrationText,
    timestamp: new Date().toISOString(),
  };
  narrativeHistory.push(narrativeEntry);

  const newWorldState = resolved.newWorldState;
  const event = resolved.event;

  // 5. Persistance atomique dans une transaction PostgreSQL
  await db.transaction(async (tx) => {
    // Met à jour la session
    await tx
      .update(kitabaSessionsTable)
      .set({
        worldVersion: newWorldState.worldVersion,
        worldState: newWorldState as unknown as Record<string, unknown>,
        narrativeHistory: narrativeHistory as unknown as Record<
          string,
          unknown
        >[],
        updatedAt: new Date(),
      })
      .where(eq(kitabaSessionsTable.id, sessionId));

    // Persiste l'événement dans le journal immuable
    await tx.insert(kitabaEventsTable).values({
      id: event.id,
      sessionId,
      worldVersion: event.worldVersion,
      actionType: event.actionType,
      actorId: event.actorId,
      locationId: event.locationId,
      targetId: event.targetId ?? null,
      description: event.description,
      consequences: event.consequences as unknown as Record<string, unknown>,
      occurredAt: event.occurredAt as unknown as Record<string, unknown>,
    });

    // Auto-save après chaque action (réussie ou non — pour permettre le rewind)
    const autoSaveName = `auto-v${newWorldState.worldVersion}`;
    await tx.insert(kitabaSavesTable).values({
      id: randomUUID(),
      sessionId,
      parentSessionId: null,
      saveType: "auto",
      saveName: autoSaveName,
      controlledEntityId: newWorldState.controlledEntityId,
      worldVersion: newWorldState.worldVersion,
      worldState: newWorldState as unknown as Record<string, unknown>,
      narrativeHistory: narrativeHistory as unknown as Record<
        string,
        unknown
      >[],
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

// ─── Sauvegarde manuelle ──────────────────────────────────────────────────────

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
    worldState: session.worldState as unknown as Record<string, unknown>,
    narrativeHistory: session.narrativeHistory as unknown as Record<
      string,
      unknown
    >[],
    savedAt,
  });
  return {
    saveId,
    saveName,
    savedAt: savedAt.toISOString(),
  };
}

// ─── Chargement d'une sauvegarde — crée une nouvelle branche ─────────────────

export async function loadSavedGame(saveId: string): Promise<{
  sessionId: string;
  characterStatus: CharacterStatus;
  narrativeHistory: NarrativeEntry[];
} | null> {
  const save = await loadSave(saveId);
  if (!save) return null;

  // Crée une nouvelle session — l'ancienne reste intacte (branchement)
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

// ─── Liste des sauvegardes manuelles ─────────────────────────────────────────

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
