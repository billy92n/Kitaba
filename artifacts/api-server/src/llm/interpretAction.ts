// llm/interpretAction.ts — Faux module LLM : interprète l'intention du joueur.
// Remplaçable par un vrai LLM sans modifier le reste du système.
// Ne reçoit QUE le texte brut du joueur — aucune donnée du monde.
// Produit une StructuredAction validée par schéma.

import type { StructuredAction, ActionType } from "../domain/actions.js";
import { validateStructuredAction } from "./schemas.js";

// Génère le radical d'un verbe en -er ou -re pour correspondance conjuguée
function keywordVariants(word: string): string[] {
  const variants = [word];
  if (word.endsWith("er")) variants.push(word.slice(0, -2)); // parler → parl
  if (word.endsWith("re")) variants.push(word.slice(0, -2)); // prendre → prend
  return variants;
}

// Dictionnaire de mots-clés par type d'action
const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  move: [
    ...keywordVariants("aller"), ...keywordVariants("marcher"),
    ...keywordVariants("courir"), ...keywordVariants("avancer"),
    ...keywordVariants("rejoindre"), ...keywordVariants("sortir"),
    ...keywordVariants("entrer"), ...keywordVariants("traverser"),
    ...keywordVariants("rentrer"), ...keywordVariants("revenir"),
    "direction", "vers", "jusqu",
    "me rends", "te rends", "se rend", "nous rendons", "vous rendez", "se rendent",
    "je vais", "tu vas", "il va", "nous allons", "vous allez", "ils vont",
    "suis allé", "me suis rendu",
  ],
  speak: [
    ...keywordVariants("parler"), ...keywordVariants("dire"),
    ...keywordVariants("demander"), ...keywordVariants("interpeller"),
    ...keywordVariants("saluer"), ...keywordVariants("répondre"),
    ...keywordVariants("interroger"), ...keywordVariants("raconter"),
    ...keywordVariants("négocier"), ...keywordVariants("questionner"),
    ...keywordVariants("appeler"), ...keywordVariants("crier"),
    ...keywordVariants("chuchoter"),
    "je parle", "tu parles", "il parle", "je dis", "tu dis", "il dit",
    "je demande", "j'aborde", "je réponds", "j'interpelle", "adresse",
  ],
  take: [
    ...keywordVariants("prendre"), ...keywordVariants("ramasser"),
    ...keywordVariants("saisir"), ...keywordVariants("attraper"),
    ...keywordVariants("récupérer"), ...keywordVariants("voler"),
    ...keywordVariants("emporter"), ...keywordVariants("collecter"),
  ],
  examine: [
    ...keywordVariants("examiner"), ...keywordVariants("regarder"),
    ...keywordVariants("observer"), ...keywordVariants("inspecter"),
    ...keywordVariants("étudier"), ...keywordVariants("lire"),
    ...keywordVariants("flairer"), ...keywordVariants("analyser"),
    ...keywordVariants("scruter"), ...keywordVariants("contempler"),
    "voir", "noter",
  ],
  give: [
    ...keywordVariants("donner"), ...keywordVariants("offrir"),
    ...keywordVariants("remettre"), ...keywordVariants("tendre"),
    ...keywordVariants("céder"), ...keywordVariants("distribuer"),
  ],
  eat: [
    ...keywordVariants("manger"), ...keywordVariants("boire"),
    ...keywordVariants("consommer"), ...keywordVariants("avaler"),
    ...keywordVariants("grignoter"), ...keywordVariants("goûter"),
    ...keywordVariants("dévorer"),
    "se nourrir", "se désaltérer",
  ],
  sleep: [
    ...keywordVariants("dormir"), ...keywordVariants("somnoler"),
    "se reposer", "s'allonger", "faire une sieste",
    "se coucher", "s'endormir", "fermer les yeux",
  ],
  attack: [
    ...keywordVariants("attaquer"), ...keywordVariants("frapper"),
    ...keywordVariants("blesser"), ...keywordVariants("combattre"),
    ...keywordVariants("menacer"), ...keywordVariants("agresser"),
    "se battre", "donner un coup",
  ],
  use: [
    ...keywordVariants("utiliser"), ...keywordVariants("employer"),
    ...keywordVariants("activer"), ...keywordVariants("actionner"),
    ...keywordVariants("allumer"), ...keywordVariants("éteindre"),
    ...keywordVariants("ouvrir"), ...keywordVariants("fermer"),
    ...keywordVariants("manipuler"),
    "se servir",
  ],
  unknown: [],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s']/g, "")
    .trim();
}

function detectActionType(input: string): ActionType {
  const n = normalize(input);
  // Priorité : "prendre" avant "examiner" (évite de confondre "prends" avec "regarde")
  const priority: ActionType[] = ["move", "take", "give", "eat", "sleep", "attack", "use", "speak", "examine", "unknown"];
  for (const actionType of priority) {
    const keywords = ACTION_KEYWORDS[actionType];
    if (keywords.some((kw) => n.includes(normalize(kw)))) {
      return actionType;
    }
  }
  return "unknown";
}

function extractTarget(input: string): string | null {
  const prepositions = ["vers", "à", "avec", "sur", "pour", "par", "au", "aux", "chez", "dans"];
  const articles = ["le", "la", "les", "l", "un", "une", "du", "de", "des"];

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = input.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = norm(words[i]).replace(/[^a-z]/g, "");
    if (prepositions.map((p) => norm(p)).includes(w) && i + 1 < words.length) {
      let start = i + 1;
      while (start < words.length && articles.map((a) => norm(a)).includes(norm(words[start]).replace(/[^a-z]/g, ""))) {
        start++;
      }
      const candidate = words.slice(start, start + 4).join(" ").replace(/[.,!?;:]+$/, "");
      if (candidate.length > 1) return candidate;
    }
  }

  // Fallback : après le premier mot (verbe probable), prend les mots suivants
  const significant = words.filter((w) => norm(w).length > 2).slice(1, 5);
  return significant.length > 0 ? significant.join(" ") : null;
}

export function interpretPlayerAction(rawInput: string): StructuredAction {
  const actionType = detectActionType(rawInput);
  const targetName = extractTarget(rawInput);

  const raw = {
    actionType: actionType as string,
    targetName,
    details: rawInput,
    rawInput,
  };

  // Validation stricte par schéma — garantit que le moteur ne reçoit que du structuré valide
  return validateStructuredAction(raw) as StructuredAction;
}
