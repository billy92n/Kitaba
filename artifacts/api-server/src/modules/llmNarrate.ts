// llmNarrate.ts — Faux module LLM : rédige la narration finale.
// Ce module est conçu pour être remplacé par un vrai LLM plus tard.
// Il reçoit le résultat de l'action (validé par le moteur) et produit du texte narratif.

import { WorldState, WorldLocation, WorldCharacter, WorldObject, formatWorldDate } from "./worldState.js";
import { ActionResult } from "./actionEngine.js";

// Sélectionne un élément au hasard dans un tableau
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Narration pour une action de déplacement
function narrateMove(result: ActionResult, state: WorldState, location: WorldLocation): string {
  if (!result.success) {
    const failures = [
      `Vous tentez de vous diriger vers ${result.targetDescription}, mais le chemin ne vous est pas familier — ou n'existe tout simplement pas depuis ici.`,
      `Vos pas hésitent. ${result.targetDescription} ne semble pas accessible depuis votre position actuelle.`,
      `Impossible de rejoindre ${result.targetDescription}. Il faudrait d'abord passer par ailleurs.`,
    ];
    return pick(failures);
  }

  const arrivals = [
    `Vous quittez votre position et vous avancez jusqu'à **${location.name}**. ${location.description}`,
    `Après quelques pas, vous arrivez à **${location.name}**. ${location.description}`,
    `Vous vous rendez à **${location.name}**. ${location.description}`,
  ];
  let text = pick(arrivals);

  // Mentionner les personnages présents
  const chars = result.witnessNames;
  if (chars && chars.length > 0) {
    if (chars.length === 1) {
      text += `\n\n${chars[0]} est présent${chars[0].endsWith("a") || chars[0].endsWith("ou") ? "e" : ""} ici.`;
    } else {
      const last = chars[chars.length - 1];
      const others = chars.slice(0, -1).join(", ");
      text += `\n\nVous apercevez ${others} et ${last} ici.`;
    }
  }

  return text;
}

// Narration pour une conversation
function narrateSpeak(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return pick([
      `Vous cherchez à parler à ${result.targetDescription}, mais personne de ce nom ne semble être là.`,
      `${result.targetDescription} est introuvable ici. Peut-être est-il ailleurs dans le village ?`,
      `Vos mots restent sans destinataire — ${result.targetDescription} n'est pas présent.`,
    ]);
  }

  const char = result.targetDescription ?? "votre interlocuteur";
  const responses = [
    `Vous approchez **${char}** et engagez la conversation.\n\n${char} vous regarde un moment, puis répond avec la prudence de qui pèse ses mots. La conversation reste brève mais cordiale. Vous apprenez peu, mais le contact est établi.`,
    `**${char}** remarque votre approche. Il lève les yeux de son ouvrage et vous adresse un signe de tête.\n\n— Étranger... Que puis-je pour vous ?\n\nVous échangez quelques mots. L'atmosphère est neutre — ni froide ni chaleureuse.`,
    `Vous interpellez **${char}**. Il s'arrête, vous dévisage, puis répond sobrement. Les mots sont courts, mais son regard en dit davantage. Il vous faudra mériter sa confiance.`,
    `**${char}** vous observe vous approcher. Sa posture reste fermée, mais ses yeux montrent une certaine curiosité.\n\n— Vous êtes nouveau ici ?\n\nLa conversation s'engage lentement.`,
  ];

  return pick(responses);
}

// Narration pour ramasser un objet
function narrateTake(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return pick([
      `Vous tendez la main vers ${result.targetDescription}, mais il n'est pas là — ou ne vous appartient pas.`,
      `Impossible de prendre ${result.targetDescription}. L'objet est introuvable ici, ou quelqu'un d'autre en est propriétaire.`,
      `${result.targetDescription} ne se laisse pas saisir. Peut-être n'est-il pas accessible.`,
    ]);
  }

  const obj = result.targetDescription ?? "l'objet";
  return pick([
    `Vous ramassez **${obj}** et le glissez dans votre sac. Il est maintenant en votre possession.`,
    `D'un geste calme, vous saisissez **${obj}**. Le poids et la texture de l'objet vous informent sur son usage possible.`,
    `**${obj}** rejoint votre inventaire. Vous l'inspectez brièvement avant de le ranger.`,
  ]);
}

// Narration pour examiner
function narrateExamine(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return pick([
      `Vous cherchez ${result.targetDescription} du regard, mais rien de tel n'est visible ici.`,
      `${result.targetDescription} ne se laisse pas identifier. Peut-être que vous regardez au mauvais endroit.`,
    ]);
  }

  const desc = result.targetDescription ?? "ce que vous observez";
  const observations = [
    `Vous examinez **${desc}** attentivement.\n\n${result.details ?? "Vos sens vous livrent quelques informations, mais rien d'inattendu. L'objet est tel qu'il paraît."}`,
    `Votre regard se pose sur **${desc}**. ${result.details ?? "Vous prenez note des détails. Rien d'extraordinaire, mais tout mérite attention dans un lieu inconnu."}`,
    `Vous vous attardez sur **${desc}**. ${result.details ?? "L'examen ne révèle rien de secret pour l'instant."}`,
  ];

  return pick(observations);
}

// Narration pour manger/boire
function narrateEat(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return `Vous n'avez rien à consommer — ni dans vos mains, ni à portée immédiate.`;
  }

  return pick([
    `Vous mangez ce que vous avez. La nourriture est simple mais bienvenue. Vous vous sentez un peu mieux.`,
    `Vous prenez le temps de vous sustenter. Votre corps vous remercie silencieusement.`,
    `Quelques bouchées suffisent à calmer les murmures de votre estomac. Vous reprenez des forces.`,
  ]);
}

// Narration pour dormir/se reposer
function narrateSleep(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return `Vous ne trouvez pas d'endroit propice au repos ici. Il vous faudrait un abri.`;
  }

  return pick([
    `Vous fermez les yeux et laissez le silence du village vous envelopper. Quelques heures plus tard, vous vous réveillez les membres moins lourds.`,
    `Le repos vous saisit rapidement. Quand vous rouvrez les yeux, la lumière a changé. Vous vous sentez plus lucide.`,
    `Vous trouvez un coin tranquille et vous y allongez. Le monde continue de tourner sans vous, et c'est bien ainsi pour l'instant.`,
  ]);
}

// Narration pour donner un objet
function narrateGive(result: ActionResult, state: WorldState): string {
  if (!result.success) {
    return `Vous ne pouvez pas donner ${result.targetDescription} — soit vous ne le possédez pas, soit votre destinataire est absent.`;
  }

  return pick([
    `Vous tendez **${result.targetDescription}** à qui de droit. L'échange est sobre, mais quelque chose dans la relation vient de changer.`,
    `L'objet change de mains. Votre geste est noté.`,
  ]);
}

// Narration pour attaquer
function narrateAttack(result: ActionResult, state: WorldState): string {
  return pick([
    `La violence n'est peut-être pas la voie la plus sage ici. Vous vous retenez au dernier moment.`,
    `Votre instinct combatif s'éveille, mais quelque chose vous arrête. Ce n'est pas le moment.`,
    `Vous envisagez l'affrontement, puis reconsidérez. Mieux vaut observer encore.`,
  ]);
}

// Narration générique
function narrateUnknown(result: ActionResult): string {
  return pick([
    `Vous essayez quelque chose, mais vos intentions restent confuses même pour vous. Rien ne se passe de notable.`,
    `L'action que vous tentez ne produit pas l'effet escompté. Peut-être faudrait-il formuler autrement.`,
    `Le monde de Salma vous observe, impassible. Votre geste est trop vague pour laisser une trace.`,
    `Vos mots ou vos actes restent suspendus dans l'air, sans réponse claire du monde qui vous entoure.`,
  ]);
}

// Suffixe d'état physique si critique
function appendStatusNote(state: WorldState): string {
  const p = state.player;
  const notes: string[] = [];
  if (p.hunger < 20) notes.push("Votre estomac crie famine.");
  else if (p.hunger < 40) notes.push("Vous commencez à ressentir la faim.");
  if (p.fatigue < 20) notes.push("La fatigue pèse sur vos épaules comme une chape de plomb.");
  else if (p.fatigue < 40) notes.push("Vous sentez le besoin de vous reposer bientôt.");
  if (p.health < 30) notes.push("Vos blessures vous font souffrir.");

  return notes.length > 0 ? "\n\n*" + notes.join(" ") + "*" : "";
}

// Point d'entrée principal du module de narration
export function generateNarration(result: ActionResult, state: WorldState): string {
  let narrative: string;

  const location = state.locations[state.player.locationId];

  switch (result.actionType) {
    case "move":
      narrative = narrateMove(result, state, location);
      break;
    case "speak":
      narrative = narrateSpeak(result, state);
      break;
    case "take":
      narrative = narrateTake(result, state);
      break;
    case "examine":
      narrative = narrateExamine(result, state);
      break;
    case "eat":
      narrative = narrateEat(result, state);
      break;
    case "sleep":
      narrative = narrateSleep(result, state);
      break;
    case "give":
      narrative = narrateGive(result, state);
      break;
    case "attack":
      narrative = narrateAttack(result, state);
      break;
    default:
      narrative = narrateUnknown(result);
  }

  narrative += appendStatusNote(state);
  return narrative;
}

// Texte d'introduction pour une nouvelle partie
export function generateIntroText(state: WorldState): string {
  const time = state.player;
  const loc = state.locations[state.player.locationId];
  const worldDate = formatWorldDate(state.time);

  return `**${worldDate}**\n\nVous vous appelez **${state.player.name}**. Ce matin, vous vous réveillez à **${loc.name}**, dans le village de Salma — un lieu que vous venez à peine de découvrir.\n\nLe ciel est couvert, l'air porte l'odeur de la terre mouillée. ${loc.description}\n\nQue faites-vous ?`;
}
