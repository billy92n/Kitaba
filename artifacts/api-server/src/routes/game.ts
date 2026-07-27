// game.ts — Routes du jeu Kitaba. La vérité du monde est toujours en base de données.

import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { createInitialWorldState } from "../modules/worldSeed.js";
import { interpretPlayerAction } from "../modules/llmInterpret.js";
import { processAction } from "../modules/actionEngine.js";
import { generateNarration, generateIntroText } from "../modules/llmNarrate.js";
import { createSession, loadSession, updateSession, createSave, loadSave, listSaves } from "../modules/storage.js";
import { formatWorldDate, WorldState } from "../modules/worldState.js";
import type { NarrativeEntry, CharacterStatus } from "../modules/types.js";

const router = Router();

// Construit le statut du personnage depuis l'état du monde
function buildCharacterStatus(state: WorldState): CharacterStatus {
  const loc = state.locations[state.player.locationId];
  return {
    name: state.player.name,
    locationName: loc?.name ?? "Inconnu",
    worldDate: formatWorldDate(state.time),
    hunger: Math.round(state.player.hunger),
    fatigue: Math.round(state.player.fatigue),
    health: Math.round(state.player.health),
  };
}

// POST /api/game/new — Démarre une nouvelle partie
router.post("/game/new", async (req: Request, res: Response) => {
  try {
    const { playerName } = req.body as { playerName: string };

    if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
      res.status(400).json({ error: "Le nom du personnage est requis." });
      return;
    }

    const worldState = createInitialWorldState(playerName.trim());
    const introText = generateIntroText(worldState);

    const introEntry: NarrativeEntry = {
      id: randomUUID(),
      type: "system",
      text: introText,
      timestamp: new Date().toISOString(),
    };

    const narrativeHistory: NarrativeEntry[] = [introEntry];

    const sessionId = await createSession(playerName.trim(), worldState, narrativeHistory);

    res.json({
      sessionId,
      characterStatus: buildCharacterStatus(worldState),
      narrativeHistory,
      introText,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la création de la partie");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/action — Traite une action du joueur
router.post("/game/action", async (req: Request, res: Response) => {
  try {
    const { sessionId, playerInput } = req.body as { sessionId: string; playerInput: string };

    if (!sessionId || !playerInput) {
      res.status(400).json({ error: "sessionId et playerInput sont requis." });
      return;
    }

    // Charge l'état depuis la base — le LLM ne détient jamais la vérité
    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }

    const { worldState, narrativeHistory } = session;

    // 1. Interprétation de l'intention (faux LLM)
    const interpreted = interpretPlayerAction(playerInput.trim());

    // 2. Vérification et application dans le monde réel (moteur déterministe)
    const actionResult = processAction(worldState, interpreted);

    // 3. Génération de la narration (faux LLM)
    const narration = generateNarration(actionResult, worldState);

    const narrativeEntry: NarrativeEntry = {
      id: randomUUID(),
      type: "narrator",
      text: narration,
      timestamp: new Date().toISOString(),
    };

    narrativeHistory.push(narrativeEntry);

    // 4. Sauvegarde du nouvel état en base
    await updateSession(sessionId, worldState, narrativeHistory);

    res.json({
      sessionId,
      narrativeEntry,
      characterStatus: buildCharacterStatus(worldState),
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors du traitement de l'action");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/save — Sauvegarde nommée
router.post("/game/save", async (req: Request, res: Response) => {
  try {
    const { sessionId, saveName } = req.body as { sessionId: string; saveName: string };

    if (!sessionId || !saveName) {
      res.status(400).json({ error: "sessionId et saveName sont requis." });
      return;
    }

    const session = await loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }

    const { worldState, narrativeHistory } = session;
    const savedAt = new Date().toISOString();

    const saveId = await createSave(
      sessionId,
      worldState.player.name,
      saveName.trim(),
      worldState,
      narrativeHistory
    );

    res.json({ saveId, saveName: saveName.trim(), savedAt });
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la sauvegarde");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/load — Charge une sauvegarde
router.post("/game/load", async (req: Request, res: Response) => {
  try {
    const { saveId } = req.body as { saveId: string };

    if (!saveId) {
      res.status(400).json({ error: "saveId est requis." });
      return;
    }

    const save = await loadSave(saveId);
    if (!save) {
      res.status(404).json({ error: "Sauvegarde introuvable." });
      return;
    }

    // Crée une nouvelle session à partir de la sauvegarde
    const newSessionId = await createSession(
      save.playerName,
      save.worldState,
      save.narrativeHistory
    );

    res.json({
      sessionId: newSessionId,
      characterStatus: buildCharacterStatus(save.worldState),
      narrativeHistory: save.narrativeHistory,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors du chargement");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// GET /api/game/saves — Liste des sauvegardes
router.get("/game/saves", async (req: Request, res: Response) => {
  try {
    const saves = await listSaves();
    res.json({
      saves: saves.map((s) => ({
        saveId: s.saveId,
        saveName: s.saveName,
        characterName: s.playerName,
        savedAt: s.savedAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors du listing des sauvegardes");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

export default router;
