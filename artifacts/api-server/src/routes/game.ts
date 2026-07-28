// routes/game.ts — Endpoints HTTP du jeu Kitaba.
// Les routes délèguent tout au gameService — aucune logique métier ici.

import { Router, type Request, type Response } from "express";
import {
  startNewGame,
  processPlayerAction,
  saveGame,
  loadSavedGame,
  getManualSaves,
} from "../services/gameService.js";

const router = Router();

// POST /api/game/new — Démarre une nouvelle partie
router.post("/game/new", async (req: Request, res: Response) => {
  const { playerName } = req.body as { playerName?: string };
  if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
    res.status(400).json({ error: "Le nom du personnage est requis." });
    return;
  }
  try {
    const result = await startNewGame(playerName);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur game/new");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/action — Traite une action du joueur
router.post("/game/action", async (req: Request, res: Response) => {
  const { sessionId, playerInput } = req.body as { sessionId?: string; playerInput?: string };
  if (!sessionId || !playerInput) {
    res.status(400).json({ error: "sessionId et playerInput sont requis." });
    return;
  }
  try {
    const result = await processPlayerAction(sessionId, playerInput);
    if (!result) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }
    res.json({ sessionId, ...result });
  } catch (err) {
    req.log.error({ err }, "Erreur game/action");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/save — Sauvegarde manuelle nommée
router.post("/game/save", async (req: Request, res: Response) => {
  const { sessionId, saveName } = req.body as { sessionId?: string; saveName?: string };
  if (!sessionId || !saveName) {
    res.status(400).json({ error: "sessionId et saveName sont requis." });
    return;
  }
  try {
    const saveId = await saveGame(sessionId, saveName);
    if (!saveId) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }
    res.json({ saveId, message: "Partie sauvegardée." });
  } catch (err) {
    req.log.error({ err }, "Erreur game/save");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// POST /api/game/load — Charge une sauvegarde (crée une nouvelle branche)
router.post("/game/load", async (req: Request, res: Response) => {
  const { saveId } = req.body as { saveId?: string };
  if (!saveId) {
    res.status(400).json({ error: "saveId est requis." });
    return;
  }
  try {
    const result = await loadSavedGame(saveId);
    if (!result) {
      res.status(404).json({ error: "Sauvegarde introuvable." });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur game/load");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// GET /api/game/saves — Liste les sauvegardes manuelles
router.get("/game/saves", async (req: Request, res: Response) => {
  try {
    const saves = await getManualSaves();
    res.json({ saves });
  } catch (err) {
    req.log.error({ err }, "Erreur game/saves");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

export default router;
