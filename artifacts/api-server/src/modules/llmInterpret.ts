// llmInterpret.ts — Faux module LLM : interprète l'intention du joueur.
// Ce module est conçu pour être remplacé par un vrai LLM plus tard.
// Il ne possède AUCUNE vérité du monde — il ne reçoit que le texte du joueur.

export type ActionType =
  | "move"
  | "speak"
  | "take"
  | "examine"
  | "give"
  | "eat"
  | "sleep"
  | "attack"
  | "use"
  | "unknown";

export interface InterpretedAction {
  actionType: ActionType;
  targetName: string | null;
  details: string;
  rawInput: string;
}

// Dictionnaire de mots-clés par type d'action
const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  move: [
    "aller", "se rendre", "marcher", "courir", "avancer", "se déplacer",
    "rejoindre", "sortir", "entrer", "traverser", "rentrer", "revenir",
    "direction", "vers", "jusqu'à",
    // formes conjuguées de "se rendre"
    "me rends", "te rends", "se rend", "nous rendons", "vous rendez", "se rendent",
    // formes conjuguées de "aller"
    "je vais", "tu vas", "il va", "nous allons", "vous allez", "ils vont",
    // formes passées
    "suis allé", "me suis rendu",
  ],
  speak: [
    "parler", "dire", "demander", "interpeller", "saluer", "répondre",
    "interroger", "raconter", "mentionner", "proposer", "négocier",
    "questionner", "appeler", "crier", "chuchoter",
    // formes conjuguées courantes
    "je parle", "tu parles", "il parle", "je dis", "tu dis", "il dit",
    "je demande", "tu demandes", "il demande", "je salue", "j'aborde",
    "je réponds", "je crie", "je chuchote", "adresse", "interpelle",
  ],
  take: [
    "prendre", "ramasser", "saisir", "attraper", "empoigner", "récupérer",
    "voler", "subtiliser", "dérober", "emporter", "collecter",
  ],
  examine: [
    "examiner", "regarder", "observer", "inspecter", "étudier", "lire",
    "flairer", "toucher", "vérifier", "analyser", "scruter", "contempler",
    "voir", "noter",
  ],
  give: [
    "donner", "offrir", "remettre", "tendre", "passer", "céder",
    "léguer", "distribuer",
  ],
  eat: [
    "manger", "boire", "consommer", "avaler", "grignoter", "goûter",
    "se nourrir", "dévorer", "ingérer", "se désaltérer",
  ],
  sleep: [
    "dormir", "se reposer", "s'allonger", "somnoler", "faire une sieste",
    "se coucher", "s'endormir", "fermer les yeux",
  ],
  attack: [
    "attaquer", "frapper", "donner un coup", "blesser", "combattre",
    "se battre", "menacer", "agresser", "lancer",
  ],
  use: [
    "utiliser", "employer", "se servir", "activer", "actionner",
    "allumer", "éteindre", "ouvrir", "fermer", "manipuler",
  ],
  unknown: [],
};

// Extraction du nom de la cible à partir du texte
function extractTarget(input: string): string | null {
  // Prépositions réelles (pas les articles)
  const prepositions = ["vers", "à", "avec", "sur", "pour", "par", "au", "aux", "chez", "dans"];
  // Articles à ignorer au début d'une cible
  const articles = ["le", "la", "les", "l'", "l'", "un", "une", "du", "de", "des"];

  // Normalise sans accents pour les mots de comparaison
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const words = input.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = normalize(words[i]);
    if (prepositions.map(normalize).includes(w) && i + 1 < words.length) {
      // Saute les articles suivants
      let start = i + 1;
      while (start < words.length && articles.map(normalize).includes(normalize(words[start]))) {
        start++;
      }
      // Prend jusqu'à 3 mots comme cible
      const candidate = words.slice(start, start + 3).join(" ");
      if (candidate.length > 1) return candidate;
    }
  }

  // Fallback : dernier groupe de mots significatif (après le premier verbe)
  const significantWords = words.filter(
    (w) => !["je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "me", "te", "se", "ma", "mon", "sa", "son", "un", "une"].includes(normalize(w))
  );
  if (significantWords.length >= 2) {
    return significantWords.slice(-3).join(" ");
  }

  return null;
}

// Génère les variantes de recherche pour un mot-clé (gère conjugaisons françaises)
function keywordVariants(keyword: string): string[] {
  const variants = [keyword];
  // Infinitif en -er → enlève le "r" final pour couvrir "marche", "parle", etc.
  if (keyword.endsWith("er") && keyword.length > 3) {
    variants.push(keyword.slice(0, -1)); // "marcher" → "marche"
  }
  // Infinitif en -re → enlève "re" → couvre "prendre" → "prend"
  if (keyword.endsWith("re") && keyword.length > 4) {
    variants.push(keyword.slice(0, -2)); // "prendre" → "prend"
    variants.push(keyword.slice(0, -1)); // "prendre" → "prendr" (moins utile)
  }
  return variants;
}

// Interprétation principale — ne connaît pas le monde, juste l'intention
export function interpretPlayerAction(rawInput: string): InterpretedAction {
  const normalizedInput = rawInput.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let bestMatch: ActionType = "unknown";
  let bestScore = 0;

  for (const [actionType, keywords] of Object.entries(ACTION_KEYWORDS) as [ActionType, string[]][]) {
    if (actionType === "unknown") continue;

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const variants = keywordVariants(normalizedKeyword);

      for (const variant of variants) {
        if (normalizedInput.includes(variant)) {
          const score = variant.length; // Favorise les correspondances plus longues
          if (score > bestScore) {
            bestScore = score;
            bestMatch = actionType;
          }
        }
      }
    }
  }

  const target = extractTarget(rawInput);

  return {
    actionType: bestMatch,
    targetName: target,
    details: rawInput,
    rawInput,
  };
}
