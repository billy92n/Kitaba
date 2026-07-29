import { Router, type Request, type Response } from "express";
import {
  LoadGameBody,
  NewGameBody,
  SaveGameBody,
  SubmitActionBody,
} from "@workspace/api-zod";
import type { ZodType } from "zod";
import {
  startNewGame,
  processPlayerAction,
  saveGame,
  loadSavedGame,
  getManualSaves,
} from "../services/gameService.js";
import { WorldVersionConflictError } from "../services/actionCommit.js";

const router = Router();

function parseBody<T>(
  schema: ZodType<T>,
  req: Request,
  res: Response,
): T | undefined {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Corps de requête invalide." });
    return undefined;
  }
  return parsed.data;
}

router.post("/game/new", async (req: Request, res: Response) => {
  const body = parseBody(NewGameBody, req, res);
  if (!body || body.playerName.trim().length === 0) {
    if (body) res.status(400).json({ error: "Corps de requête invalide." });
    return;
  }
  try {
    res.json(await startNewGame(body.playerName));
  } catch (err) {
    req.log.error({ err }, "Erreur game/new");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/game/action", async (req: Request, res: Response) => {
  const body = parseBody(SubmitActionBody, req, res);
  if (
    !body ||
    body.sessionId.trim().length === 0 ||
    body.playerInput.trim().length === 0
  ) {
    if (body) res.status(400).json({ error: "Corps de requête invalide." });
    return;
  }
  try {
    const result = await processPlayerAction(body.sessionId, body.playerInput);
    if (!result) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }
    res.json({ sessionId: body.sessionId, ...result });
  } catch (err) {
    if (err instanceof WorldVersionConflictError) {
      res.status(409).json({ error: err.code });
      return;
    }
    req.log.error({ err }, "Erreur game/action");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/game/save", async (req: Request, res: Response) => {
  const body = parseBody(SaveGameBody, req, res);
  if (
    !body ||
    body.sessionId.trim().length === 0 ||
    body.saveName.trim().length === 0
  ) {
    if (body) res.status(400).json({ error: "Corps de requête invalide." });
    return;
  }
  try {
    const save = await saveGame(body.sessionId, body.saveName);
    if (!save) {
      res.status(404).json({ error: "Session introuvable." });
      return;
    }
    res.json(save);
  } catch (err) {
    req.log.error({ err }, "Erreur game/save");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/game/load", async (req: Request, res: Response) => {
  const body = parseBody(LoadGameBody, req, res);
  if (!body || body.saveId.trim().length === 0) {
    if (body) res.status(400).json({ error: "Corps de requête invalide." });
    return;
  }
  try {
    const result = await loadSavedGame(body.saveId);
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

router.get("/game/saves", async (req: Request, res: Response) => {
  try {
    res.json({ saves: await getManualSaves() });
  } catch (err) {
    req.log.error({ err }, "Erreur game/saves");
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

export default router;
