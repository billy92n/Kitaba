// llm/narrateResult.ts — Faux module LLM : génère la narration.
// Reçoit UNIQUEMENT les PerceptibleFacts de l'entité contrôlée.
// N'a jamais accès au WorldState complet — les informations secrètes sont invisibles ici.

import type { PerceptibleFacts } from "../domain/knowledge.js";
import type { WorldState } from "../domain/world.js";
import { formatWorldDate } from "../domain/world.js";

// ─── Narration par type d'action ──────────────────────────────────────────────

function narrateMove(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Ce chemin vous est inaccessible.";
    return reason;
  }
  const loc = facts.locationName;
  const desc = facts.locationDescription;
  const others = facts.presentEntities.filter((e) => e.name !== facts.actorName);

  const openers = [
    `Vous arrivez ${loc.startsWith("La") || loc.startsWith("Le") ? "à" : "à la"} ${loc}.`,
    `Vos pas vous mènent jusqu'à ${loc}.`,
    `Vous pénétrez dans ${loc}.`,
  ];
  const opener = openers[Math.floor(Math.random() * openers.length)];

  let text = `${opener} ${desc}`;
  if (others.length > 0) {
    const names = others.map((e) => `${e.name} (${e.occupation})`).join(", ");
    text += ` Vous apercevez : ${names}.`;
  }
  return text;
}

function narrateSpeak(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Personne ici pour vous répondre.";
    return reason;
  }
  const target = facts.actionOutcome.targetName ?? "votre interlocuteur";
  const moods = ["pensif", "attentif", "distrait", "cordial", "réservé"];
  const randomMood = moods[Math.floor(Math.random() * moods.length)];
  return `${target} vous écoute, l'air ${randomMood}. Vos mots semblent résonner dans l'air, sans vraiment trouver de réponse immédiate. La conversation s'interrompt naturellement.`;
}

function narrateTake(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Vous ne trouvez rien de tel ici.";
    return reason;
  }
  const target = facts.actionOutcome.targetName ?? "l'objet";
  return `Vous saisissez ${target} et le glissez dans vos affaires. Son poids est familier dans votre main.`;
}

function narrateExamine(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Rien de particulier à observer ici.";
    return reason;
  }
  const detail = facts.actionOutcome.observableFacts[0] ?? "Vous l'examinez attentivement.";
  return detail;
}

function narrateEat(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Vous n'avez rien à manger.";
    return reason;
  }
  const target = facts.actionOutcome.targetName ?? "ce que vous aviez";
  return `Vous consommez ${target}. La chaleur de la nourriture se répand en vous, apportant un réconfort bienvenu.`;
}

function narrateSleep(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Ce n'est pas l'endroit pour dormir.";
    return reason;
  }
  return `Vous vous allongez et fermez les yeux. Le sommeil vient rapidement. Lorsque vous vous réveillez, votre corps se sent moins lourd.`;
}

function narrateGive(facts: PerceptibleFacts): string {
  if (!facts.actionOutcome.success) {
    const reason = facts.actionOutcome.observableFacts[0] ?? "Vous ne pouvez pas effectuer cet échange.";
    return reason;
  }
  const target = facts.actionOutcome.targetName ?? "votre interlocuteur";
  return `Vous tendez l'objet à ${target}, qui l'accepte sans un mot.`;
}

function narrateAttack(_facts: PerceptibleFacts): string {
  return `Vous retenez votre geste. La violence n'est pas la solution ici — du moins, pas encore.`;
}

function narrateUnknown(facts: PerceptibleFacts): string {
  const raw = facts.actionOutcome.targetName ?? facts.actionOutcome.observableFacts[0] ?? "cette action";
  return `Vous tentez quelque chose — "${raw}" — mais le monde ne répond pas à votre geste. Peut-être une autre formulation ?`;
}

// ─── Suffixe d'état critique ──────────────────────────────────────────────────

function criticalStatusSuffix(facts: PerceptibleFacts): string {
  if (!facts.entityStats) return "";
  const parts: string[] = [];
  if (facts.entityStats.hunger < 20) parts.push("La faim vous tenaille — votre estomac crie famine.");
  if (facts.entityStats.fatigue < 20) parts.push("Vos membres sont lourds comme du plomb. Vous devez dormir.");
  if (facts.entityStats.health < 30) parts.push("Vous sentez votre corps défaillir. Il faut prendre soin de vous.");
  return parts.length > 0 ? "\n\n*" + parts.join(" ") + "*" : "";
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

export function narrateFromPerception(facts: PerceptibleFacts): string {
  let base: string;
  switch (facts.actionOutcome.actionType) {
    case "move":    base = narrateMove(facts);    break;
    case "speak":   base = narrateSpeak(facts);   break;
    case "take":    base = narrateTake(facts);    break;
    case "examine": base = narrateExamine(facts); break;
    case "eat":     base = narrateEat(facts);     break;
    case "sleep":   base = narrateSleep(facts);   break;
    case "give":    base = narrateGive(facts);    break;
    case "attack":  base = narrateAttack(facts);  break;
    default:        base = narrateUnknown(facts); break;
  }
  return base + criticalStatusSuffix(facts);
}

// Texte d'introduction — utilise les faits visibles du lieu de départ uniquement
export function generateIntroText(state: WorldState): string {
  const controlledEntity = state.entities[state.controlledEntityId];
  if (!controlledEntity) return "Vous ouvrez les yeux sur un monde inconnu.";
  const loc = state.locations[controlledEntity.locationId];
  const time = formatWorldDate(state.time);
  return `${time}. Vous êtes ${controlledEntity.name}, ${controlledEntity.occupation} de votre état, fraîchement arrivé au village de Salma. ${loc?.description ?? ""} La journée commence.`;
}
