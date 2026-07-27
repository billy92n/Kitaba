// worldSeed.ts — Données initiales fixes du monde de Kitaba.
// Ce module ne doit jamais être modifié par le LLM.

import { WorldState } from "./worldState.js";

export function createInitialWorldState(playerName: string): WorldState {
  return {
    locations: {
      place_centrale: {
        id: "place_centrale",
        name: "Place centrale de Salma",
        description:
          "Le cœur du village de Salma. Une fontaine ancienne trône au milieu de pavés irréguliers. Les villageois s'y croisent au fil de la journée. Les maisons aux murs de terre ocre forment un cercle rassurant.",
        connectedLocations: ["taverne_du_loup", "forge_hamid", "ferme_oumou"],
        presentCharacters: [],
        presentObjects: ["vieille_enseigne"],
      },
      taverne_du_loup: {
        id: "taverne_du_loup",
        name: "Taverne du Loup Gris",
        description:
          "Une salle basse et enfumée où l'odeur de bière et de ragoût se mêle à celle du bois brûlé. Des tables en chêne épais, une cheminée toujours allumée. Tariq, le patron, essuie ses verres derrière le comptoir.",
        connectedLocations: ["place_centrale"],
        presentCharacters: ["tariq", "leila"],
        presentObjects: ["pain_taverne", "lanterne_taverne"],
      },
      forge_hamid: {
        id: "forge_hamid",
        name: "Forge de Hamid",
        description:
          "Le bruit du marteau sur l'enclume s'entend depuis la place. La chaleur du four frappe comme un mur dès l'entrée. Des outils soigneusement rangés couvrent les murs. Hamid travaille ici depuis trente ans.",
        connectedLocations: ["place_centrale"],
        presentCharacters: ["hamid", "amir"],
        presentObjects: ["marteau_hamid", "minerai_fer"],
      },
      ferme_oumou: {
        id: "ferme_oumou",
        name: "Ferme d'Oumou",
        description:
          "Un domaine modeste mais bien tenu, à la lisière du village. Des poules picorent entre les rangées de légumes. Une vieille lanterne rouillée pend à l'entrée de la grange. Oumou y travaille du lever au coucher du soleil.",
        connectedLocations: ["place_centrale"],
        presentCharacters: ["oumou"],
        presentObjects: ["lanterne_rouille", "panier_legumes"],
      },
    },

    characters: {
      hamid: {
        id: "hamid",
        name: "Hamid",
        occupation: "Forgeron",
        locationId: "forge_hamid",
        description:
          "Un homme trapu aux mains calleuses et au regard direct. Forgeron de père en fils, il est respecté de tous à Salma. Il parle peu mais chaque mot compte.",
        mood: "concentré",
        inventory: [],
      },
      oumou: {
        id: "oumou",
        name: "Oumou",
        occupation: "Paysanne",
        locationId: "ferme_oumou",
        description:
          "Une femme d'une cinquantaine d'années, vive et chaleureuse. Elle connaît tout le monde et n'hésite pas à partager nouvelles et conseils. Sa ferme est la plus productive du village.",
        mood: "affable",
        inventory: ["panier_legumes"],
      },
      tariq: {
        id: "tariq",
        name: "Tariq",
        occupation: "Aubergiste",
        locationId: "taverne_du_loup",
        description:
          "Un homme jovial au ventre généreux et à la barbe fournie. Il tient la Taverne du Loup Gris depuis vingt ans et connaît plus de secrets que n'importe quel curé. Il a toujours une anecdote à raconter.",
        mood: "jovial",
        inventory: ["pain_taverne"],
      },
      leila: {
        id: "leila",
        name: "Leila",
        occupation: "Marchande",
        locationId: "taverne_du_loup",
        description:
          "Une femme élégante venue de la cité, aux vêtements de qualité et au regard calculateur. Elle négocie en silence, observe tout, et ne révèle jamais ses intentions. On dit qu'elle commerce avec des maisons nobles.",
        mood: "méfiant",
        inventory: ["registre_marchand"],
      },
      amir: {
        id: "amir",
        name: "Amir",
        occupation: "Apprenti forgeron",
        locationId: "forge_hamid",
        description:
          "Un jeune homme de dix-huit ans, énergique et curieux. Il apprend son métier sous l'œil sévère de Hamid. Il rêve de voyager et pose des questions à quiconque vient de loin.",
        mood: "curieux",
        inventory: [],
      },
    },

    objects: {
      marteau_hamid: {
        id: "marteau_hamid",
        name: "Marteau de forge",
        description: "Un lourd marteau en fer forgé. La tête est usée par des milliers de coups, le manche en bois de frêne est lisse à la paume.",
        locationId: "forge_hamid",
        ownerId: "hamid",
        properties: { weight: "lourd", condition: "bon" },
      },
      minerai_fer: {
        id: "minerai_fer",
        name: "Bloc de minerai de fer",
        description: "Un bloc brut de minerai sombre, extrait des collines environnantes. Il attend d'être travaillé.",
        locationId: "forge_hamid",
        ownerId: null,
        properties: { weight: "lourd", condition: "brut" },
      },
      pain_taverne: {
        id: "pain_taverne",
        name: "Miche de pain",
        description: "Un pain rond à la croûte dorée, cuit le matin même. Il sent encore chaud.",
        locationId: "taverne_du_loup",
        ownerId: "tariq",
        properties: { edible: true, condition: "frais" },
      },
      lanterne_taverne: {
        id: "lanterne_taverne",
        name: "Lanterne de la taverne",
        description: "Une lanterne en fer-blanc accrochée à la poutre maîtresse. Sa flamme vacille au moindre courant d'air.",
        locationId: "taverne_du_loup",
        ownerId: null,
        properties: { lit: true, condition: "usé" },
      },
      lanterne_rouille: {
        id: "lanterne_rouille",
        name: "Vieille lanterne rouillée",
        description: "Une lanterne abandonnée à l'entrée de la grange d'Oumou. La rouille a mangé ses flancs mais elle peut encore fonctionner.",
        locationId: "ferme_oumou",
        ownerId: null,
        properties: { lit: false, condition: "détérioré" },
      },
      panier_legumes: {
        id: "panier_legumes",
        name: "Panier de légumes",
        description: "Un panier d'osier rempli de carottes, navets et oignons frais cueillis.",
        locationId: "ferme_oumou",
        ownerId: "oumou",
        properties: { edible: true, condition: "frais" },
      },
      registre_marchand: {
        id: "registre_marchand",
        name: "Registre de Leila",
        description: "Un carnet relié de cuir noir couvert de chiffres et de noms en petite écriture serrée. Les pages semblent contenir des comptes de plusieurs maisons marchandes.",
        locationId: null,
        ownerId: "leila",
        properties: { readable: true, condition: "bon" },
      },
      vieille_enseigne: {
        id: "vieille_enseigne",
        name: "Vieille enseigne en bois",
        description: "Une enseigne de bois sculptée indiquant les directions vers la taverne, la forge et la ferme. Elle penche légèrement.",
        locationId: "place_centrale",
        ownerId: null,
        properties: { condition: "vieux" },
      },
    },

    relations: [
      {
        characterAId: "hamid",
        characterBId: "amir",
        type: "maître-apprenti",
        strength: 75,
        notes: "Hamid est exigeant mais fier d'Amir. Amir le respecte profondément.",
      },
      {
        characterAId: "oumou",
        characterBId: "tariq",
        type: "vieille amitié",
        strength: 85,
        notes: "Ils se connaissent depuis l'enfance. Oumou fournit des légumes à la taverne.",
      },
      {
        characterAId: "hamid",
        characterBId: "oumou",
        type: "voisinage",
        strength: 60,
        notes: "Ils se respectent sans être proches. Hamid répare les outils de la ferme.",
      },
      {
        characterAId: "leila",
        characterBId: "tariq",
        type: "relation commerciale",
        strength: 45,
        notes: "Leila loge à la taverne lors de ses passages. Tariq la trouve mystérieuse.",
      },
      {
        characterAId: "amir",
        characterBId: "leila",
        type: "curiosité mutuelle",
        strength: 30,
        notes: "Amir l'aborde souvent pour avoir des nouvelles de la cité. Elle répond vaguement.",
      },
    ],

    events: [],

    player: {
      name: playerName,
      locationId: "place_centrale",
      hunger: 70,
      fatigue: 85,
      health: 95,
      inventory: [],
      knowledge: ["Le village s'appelle Salma.", "Il y a une taverne, une forge et une ferme ici."],
      memories: [],
      aspirations: [],
      objectives: [],
    },

    time: {
      year: 1,
      season: "automne",
      day: 3,
      hour: 9,
    },
  };
}
