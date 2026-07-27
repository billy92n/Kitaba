// actionEngine.ts — Vérifie les actions contre l'état réel du monde et applique les conséquences.
// Le LLM ne participe pas ici. Toute la logique est déterministe.

import {
  WorldState,
  WorldLocation,
  WorldCharacter,
  WorldObject,
  LocationId,
  CharacterId,
  ObjectId,
  getCharactersAt,
  getObjectsAt,
} from "./worldState.js";
import { ActionType, InterpretedAction } from "./llmInterpret.js";

export interface ActionResult {
  actionType: ActionType;
  success: boolean;
  targetDescription: string | null;
  details: string | null;
  witnessNames?: string[];
  stateChanged: boolean;
}

// Normalise un texte pour comparaison floue
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// Cherche un lieu par correspondance partielle du nom
function findLocation(state: WorldState, query: string | null): WorldLocation | null {
  if (!query) return null;
  // Supprime les articles en début de requête
  const stripped = query.replace(/^(la|le|les|l'|l'|du|au|aux|un|une)\s+/i, "").trim();
  const q = normalize(stripped || query);
  for (const loc of Object.values(state.locations)) {
    const locName = normalize(loc.name);
    if (locName.includes(q) || q.includes(normalize(loc.id)) || locName.split(" ").some(word => word.length > 3 && q.includes(word))) {
      return loc;
    }
  }
  return null;
}

// Cherche un personnage par nom dans la même pièce
function findCharacterAt(state: WorldState, locationId: LocationId, query: string | null): WorldCharacter | null {
  if (!query) return null;
  const q = normalize(query);
  const chars = getCharactersAt(state, locationId);
  return chars.find((c) => normalize(c.name).includes(q)) ?? null;
}

// Cherche un objet par nom dans la même pièce ou dans l'inventaire du joueur
function findObjectAvailable(state: WorldState, query: string | null): WorldObject | null {
  if (!query) return null;
  const q = normalize(query);
  const locationId = state.player.locationId;

  // Cherche dans l'inventaire du joueur (priorité)
  for (const objId of state.player.inventory) {
    const obj = state.objects[objId];
    if (obj && normalize(obj.name).includes(q)) return obj;
  }

  // Cherche parmi TOUS les objets présents dans ce lieu (y compris ceux des PNJ)
  const allLocationObjects = Object.values(state.objects).filter(
    (o) => o.locationId === locationId || (o.ownerId !== null && state.characters[o.ownerId]?.locationId === locationId)
  );
  const found = allLocationObjects.find((o) => normalize(o.name).includes(q));
  if (found) return found;

  return null;
}

// Cherche n'importe quel objet ou personnage visible par nom
function findAnything(state: WorldState, query: string | null): { name: string; description: string } | null {
  if (!query) return null;
  const q = normalize(query);
  const locationId = state.player.locationId;

  // Objets au sol
  const groundObjects = Object.values(state.objects).filter(
    (o) => o.locationId === locationId || state.player.inventory.includes(o.id)
  );
  for (const obj of groundObjects) {
    if (normalize(obj.name).includes(q)) return { name: obj.name, description: obj.description };
  }

  // Personnages présents
  const chars = getCharactersAt(state, locationId);
  for (const c of chars) {
    if (normalize(c.name).includes(q)) return { name: c.name, description: c.description };
  }

  // Lieux connectés
  const loc = state.locations[locationId];
  for (const connId of loc.connectedLocations) {
    const connLoc = state.locations[connId];
    if (connLoc && normalize(connLoc.name).includes(q)) {
      return { name: connLoc.name, description: connLoc.description };
    }
  }

  // Lieu actuel lui-même
  if (normalize(loc.name).includes(q)) {
    return { name: loc.name, description: loc.description };
  }

  return null;
}

// Avance le temps du monde (en minutes)
function advanceTime(state: WorldState, minutes: number): void {
  state.time.hour += Math.floor(minutes / 60);
  const extraMinutes = minutes % 60;
  if (extraMinutes > 30) state.time.hour += 1;

  if (state.time.hour >= 24) {
    state.time.hour = state.time.hour % 24;
    state.time.day += 1;
  }
}

// Applique une dégradation passive des stats
function applyPassiveDegradation(state: WorldState, intensity: number = 1): void {
  state.player.hunger = Math.max(0, state.player.hunger - intensity * 2);
  state.player.fatigue = Math.max(0, state.player.fatigue - intensity * 1);
}

// --- Handlers d'action ---

function handleMove(state: WorldState, action: InterpretedAction): ActionResult {
  const rawQuery = action.targetName ?? action.rawInput;
  const currentLoc = state.locations[state.player.locationId];

  // Cherche la destination
  const destination = findLocation(state, rawQuery);

  if (!destination) {
    return {
      actionType: "move",
      success: false,
      targetDescription: rawQuery,
      details: null,
      stateChanged: false,
    };
  }

  // Vérifie que le lieu est accessible depuis la position actuelle
  if (!currentLoc.connectedLocations.includes(destination.id) && destination.id !== state.player.locationId) {
    return {
      actionType: "move",
      success: false,
      targetDescription: destination.name,
      details: null,
      stateChanged: false,
    };
  }

  // Déplace le joueur
  state.player.locationId = destination.id;
  advanceTime(state, 10);
  applyPassiveDegradation(state, 1);

  const chars = getCharactersAt(state, destination.id);
  const witnessNames = chars.map((c) => c.name);

  return {
    actionType: "move",
    success: true,
    targetDescription: destination.name,
    details: destination.description,
    witnessNames,
    stateChanged: true,
  };
}

function handleSpeak(state: WorldState, action: InterpretedAction): ActionResult {
  const locationId = state.player.locationId;
  const rawQuery = action.targetName ?? action.rawInput;
  const char = findCharacterAt(state, locationId, rawQuery);

  advanceTime(state, 15);
  applyPassiveDegradation(state, 1);

  if (!char) {
    return {
      actionType: "speak",
      success: false,
      targetDescription: rawQuery,
      details: null,
      stateChanged: false,
    };
  }

  // Ajoute une connaissance mémorisée
  const memory = `Vous avez parlé à ${char.name} (${char.occupation}).`;
  if (!state.player.memories.includes(memory)) {
    state.player.memories.push(memory);
  }

  return {
    actionType: "speak",
    success: true,
    targetDescription: char.name,
    details: `${char.name} est ${char.occupation}, d'humeur ${char.mood}. ${char.description}`,
    stateChanged: true,
  };
}

function handleTake(state: WorldState, action: InterpretedAction): ActionResult {
  const rawQuery = action.targetName ?? action.rawInput;
  const obj = findObjectAvailable(state, rawQuery);

  applyPassiveDegradation(state, 1);

  if (!obj) {
    return {
      actionType: "take",
      success: false,
      targetDescription: rawQuery,
      details: null,
      stateChanged: false,
    };
  }

  // Vérifier que l'objet n'a pas de propriétaire (sinon c'est voler)
  if (obj.ownerId && obj.ownerId !== null) {
    // On permet quand même pour le prototype, mais note-le
    const ownerChar = state.characters[obj.ownerId];
    const ownerName = ownerChar ? ownerChar.name : "quelqu'un";
    // Retire l'objet de la liste des objets du lieu
  }

  // Retire du lieu
  if (obj.locationId && state.locations[obj.locationId]) {
    const loc = state.locations[obj.locationId];
    loc.presentObjects = loc.presentObjects.filter((id) => id !== obj.id);
  }

  // Retire de l'inventaire d'un PNJ si besoin
  if (obj.ownerId && state.characters[obj.ownerId]) {
    state.characters[obj.ownerId].inventory = state.characters[obj.ownerId].inventory.filter(
      (id) => id !== obj.id
    );
  }

  // Ajoute à l'inventaire du joueur
  obj.locationId = null;
  obj.ownerId = null;
  state.player.inventory.push(obj.id);

  return {
    actionType: "take",
    success: true,
    targetDescription: obj.name,
    details: obj.description,
    stateChanged: true,
  };
}

function handleExamine(state: WorldState, action: InterpretedAction): ActionResult {
  const rawQuery = action.targetName ?? action.rawInput;
  const found = findAnything(state, rawQuery);

  advanceTime(state, 5);

  if (!found) {
    // Examine le lieu actuel si pas de cible précise
    const loc = state.locations[state.player.locationId];
    return {
      actionType: "examine",
      success: true,
      targetDescription: loc.name,
      details: loc.description,
      stateChanged: false,
    };
  }

  return {
    actionType: "examine",
    success: true,
    targetDescription: found.name,
    details: found.description,
    stateChanged: false,
  };
}

function handleEat(state: WorldState, action: InterpretedAction): ActionResult {
  const rawQuery = action.targetName;

  // Cherche un objet comestible dans l'inventaire ou au sol
  let foodObj: WorldObject | null = null;

  for (const objId of state.player.inventory) {
    const obj = state.objects[objId];
    if (obj && obj.properties["edible"] === true) {
      if (!rawQuery || normalize(obj.name).includes(normalize(rawQuery))) {
        foodObj = obj;
        break;
      }
    }
  }

  if (!foodObj && rawQuery) {
    const groundObjs = getObjectsAt(state, state.player.locationId);
    foodObj = groundObjs.find(
      (o) => o.properties["edible"] === true && normalize(o.name).includes(normalize(rawQuery))
    ) ?? null;
  }

  if (!foodObj) {
    return {
      actionType: "eat",
      success: false,
      targetDescription: rawQuery ?? "nourriture",
      details: null,
      stateChanged: false,
    };
  }

  // Consomme l'objet
  state.player.inventory = state.player.inventory.filter((id) => id !== foodObj!.id);
  delete state.objects[foodObj.id];

  // Restaure la faim
  state.player.hunger = Math.min(100, state.player.hunger + 30);
  advanceTime(state, 10);

  return {
    actionType: "eat",
    success: true,
    targetDescription: foodObj.name,
    details: null,
    stateChanged: true,
  };
}

function handleSleep(state: WorldState, action: InterpretedAction): ActionResult {
  // Le repos est possible presque partout pour le prototype
  const loc = state.locations[state.player.locationId];
  const isRestPlace = ["taverne_du_loup", "ferme_oumou"].includes(loc.id);

  if (!isRestPlace) {
    return {
      actionType: "sleep",
      success: false,
      targetDescription: loc.name,
      details: null,
      stateChanged: false,
    };
  }

  // Récupère la fatigue, avance beaucoup de temps
  state.player.fatigue = Math.min(100, state.player.fatigue + 50);
  state.player.hunger = Math.max(0, state.player.hunger - 15);
  advanceTime(state, 360); // 6 heures

  return {
    actionType: "sleep",
    success: true,
    targetDescription: loc.name,
    details: null,
    stateChanged: true,
  };
}

function handleGive(state: WorldState, action: InterpretedAction): ActionResult {
  // Cherche objet dans l'inventaire du joueur
  const rawQuery = action.targetName;
  let giveObj: WorldObject | null = null;

  for (const objId of state.player.inventory) {
    const obj = state.objects[objId];
    if (obj && rawQuery && normalize(obj.name).includes(normalize(rawQuery))) {
      giveObj = obj;
      break;
    }
  }

  if (!giveObj) {
    return {
      actionType: "give",
      success: false,
      targetDescription: rawQuery ?? "l'objet",
      details: null,
      stateChanged: false,
    };
  }

  // Retire de l'inventaire du joueur, laisse dans le lieu
  state.player.inventory = state.player.inventory.filter((id) => id !== giveObj!.id);
  giveObj.locationId = state.player.locationId;
  giveObj.ownerId = null;

  if (state.locations[state.player.locationId]) {
    state.locations[state.player.locationId].presentObjects.push(giveObj.id);
  }

  advanceTime(state, 5);
  applyPassiveDegradation(state, 1);

  return {
    actionType: "give",
    success: true,
    targetDescription: giveObj.name,
    details: null,
    stateChanged: true,
  };
}

function handleAttack(_state: WorldState, action: InterpretedAction): ActionResult {
  // Le combat n'est pas implémenté dans ce prototype
  return {
    actionType: "attack",
    success: false,
    targetDescription: action.targetName,
    details: null,
    stateChanged: false,
  };
}

function handleUnknown(_state: WorldState, action: InterpretedAction): ActionResult {
  return {
    actionType: "unknown",
    success: false,
    targetDescription: null,
    details: null,
    stateChanged: false,
  };
}

// --- Point d'entrée principal ---

export function processAction(state: WorldState, action: InterpretedAction): ActionResult {
  switch (action.actionType) {
    case "move":
      return handleMove(state, action);
    case "speak":
      return handleSpeak(state, action);
    case "take":
      return handleTake(state, action);
    case "examine":
      return handleExamine(state, action);
    case "eat":
      return handleEat(state, action);
    case "sleep":
      return handleSleep(state, action);
    case "give":
      return handleGive(state, action);
    case "attack":
      return handleAttack(state, action);
    default:
      return handleUnknown(state, action);
  }
}
