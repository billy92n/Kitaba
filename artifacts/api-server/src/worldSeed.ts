// worldSeed.ts — Données initiales fixes du monde de Kitaba.
// Le personnage contrôlé par le joueur utilise exactement le même modèle Entity qu'un PNJ.
// La distinction se fait uniquement via WorldState.controlledEntityId.

import type { WorldState } from "./domain/world.js";
import type { Entity } from "./domain/entities.js";
import type { Relation } from "./domain/relations.js";

export function createInitialWorldState(playerName: string): WorldState {
  const playerId = "player";

  const playerEntity: Entity = {
    id: playerId,
    name: playerName,
    occupation: "Voyageur",
    locationId: "place_centrale",
    description: `Un voyageur nouvellement arrivé à Salma. Son regard est curieux, ses pas encore hésitants sur les pavés du village.`,
    mood: "curieux",
    inventory: [],
    // Stats vitales — optionnelles pour les PNJ, présentes ici car entité contrôlée
    hunger: 70,
    fatigue: 85,
    health: 95,
    knowledge: ["Le village s'appelle Salma.", "Il y a une taverne, une forge et une ferme ici."],
    memories: [],
    objectives: [],
  };

  const npcs: Record<string, Entity> = {
    hamid: {
      id: "hamid",
      name: "Hamid",
      occupation: "Forgeron",
      locationId: "forge_hamid",
      description: "Un homme trapu aux mains calleuses et au regard direct. Forgeron de père en fils, il est respecté de tous à Salma. Il parle peu mais chaque mot compte.",
      mood: "concentré",
      inventory: [],
    },
    oumou: {
      id: "oumou",
      name: "Oumou",
      occupation: "Paysanne",
      locationId: "ferme_oumou",
      description: "Une femme d'une cinquantaine d'années, vive et chaleureuse. Elle connaît tout le monde et n'hésite pas à partager nouvelles et conseils. Sa ferme est la plus productive du village.",
      mood: "affable",
      inventory: ["panier_legumes"],
    },
    tariq: {
      id: "tariq",
      name: "Tariq",
      occupation: "Aubergiste",
      locationId: "taverne_du_loup",
      description: "Un homme jovial au ventre généreux et à la barbe fournie. Il tient la Taverne du Loup Gris depuis vingt ans et connaît plus de secrets que n'importe quel curé.",
      mood: "jovial",
      inventory: ["pain_taverne"],
    },
    leila: {
      id: "leila",
      name: "Leila",
      occupation: "Marchande",
      locationId: "taverne_du_loup",
      description: "Une femme élégante venue de la cité, aux vêtements de qualité et au regard calculateur. Elle négocie en silence, observe tout, et ne révèle jamais ses intentions.",
      mood: "méfiant",
      inventory: [],
    },
    amir: {
      id: "amir",
      name: "Amir",
      occupation: "Apprenti forgeron",
      locationId: "forge_hamid",
      description: "Un jeune homme de dix-sept ans, les bras maigres mais les yeux brillants d'ambition. Il apprend le métier de Hamid depuis deux ans.",
      mood: "enthousiaste",
      inventory: [],
    },
  };

  const relations: Relation[] = [
    { entityAId: "hamid", entityBId: "amir",  type: "maître-apprenti",    strength: 75, notes: "Hamid est exigeant mais bienveillant. Amir l'admire profondément." },
    { entityAId: "tariq", entityBId: "oumou", type: "vieille amitié",     strength: 85, notes: "Ils se connaissent depuis l'enfance. Oumou fournit des légumes à la taverne." },
    { entityAId: "hamid", entityBId: "oumou", type: "voisinage",          strength: 60, notes: "Ils se respectent sans être proches. Hamid répare les outils de la ferme." },
    { entityAId: "leila", entityBId: "tariq", type: "relation commerciale", strength: 45, notes: "Leila loge à la taverne lors de ses passages. Tariq la trouve mystérieuse." },
    { entityAId: "amir",  entityBId: "leila", type: "curiosité mutuelle", strength: 30, notes: "Amir l'aborde souvent pour avoir des nouvelles de la cité. Elle répond vaguement." },
  ];

  return {
    worldVersion: 0,
    controlledEntityId: playerId,

    locations: {
      place_centrale: {
        id: "place_centrale",
        name: "Place centrale de Salma",
        description: "Le cœur du village de Salma. Une fontaine ancienne trône au milieu de pavés irréguliers. Les villageois s'y croisent au fil de la journée. Les maisons aux murs de terre ocre forment un cercle rassurant.",
        connectedLocations: ["taverne_du_loup", "forge_hamid", "ferme_oumou"],
        presentEntities: [playerId],
        presentObjects: ["vieille_enseigne"],
      },
      taverne_du_loup: {
        id: "taverne_du_loup",
        name: "Taverne du Loup Gris",
        description: "Une salle basse et enfumée où l'odeur de bière et de ragoût se mêle à celle du bois brûlé. Des tables en chêne épais, une cheminée toujours allumée. Tariq, le patron, essuie ses verres derrière le comptoir.",
        connectedLocations: ["place_centrale"],
        presentEntities: ["tariq", "leila"],
        presentObjects: ["lanterne_taverne"],
      },
      forge_hamid: {
        id: "forge_hamid",
        name: "Forge de Hamid",
        description: "Le bruit du marteau sur l'enclume s'entend depuis la place. La chaleur du four frappe comme un mur dès l'entrée. Des outils soigneusement rangés couvrent les murs. Hamid travaille ici depuis trente ans.",
        connectedLocations: ["place_centrale"],
        presentEntities: ["hamid", "amir"],
        presentObjects: ["marteau_hamid", "minerai_fer"],
      },
      ferme_oumou: {
        id: "ferme_oumou",
        name: "Ferme d'Oumou",
        description: "Un domaine modeste mais bien tenu, à la lisière du village. Des poules picorent entre les rangées de légumes. Une vieille lanterne rouillée pend à l'entrée de la grange. Oumou y travaille du lever au coucher du soleil.",
        connectedLocations: ["place_centrale"],
        presentEntities: ["oumou"],
        presentObjects: ["lanterne_rouille"],
      },
    },

    entities: {
      [playerId]: playerEntity,
      ...npcs,
    },

    objects: {
      vieille_enseigne: {
        id: "vieille_enseigne",
        name: "vieille enseigne",
        description: "Une enseigne en bois sculpté représentant un loup hurlant, suspendue au-dessus de l'entrée de la taverne. La peinture s'écaille par endroits.",
        locationId: "place_centrale",
        ownerId: null,
        properties: {},
      },
      pain_taverne: {
        id: "pain_taverne",
        name: "miche de pain",
        description: "Un pain rond à la croûte épaisse, encore tiède. L'odeur est irrésistible.",
        locationId: null,
        ownerId: "tariq",
        properties: { edible: true },
      },
      lanterne_taverne: {
        id: "lanterne_taverne",
        name: "lanterne de la taverne",
        description: "Une lanterne en fer forgé qui diffuse une lumière chaude et vacillante.",
        locationId: "taverne_du_loup",
        ownerId: null,
        properties: { lit: true },
      },
      marteau_hamid: {
        id: "marteau_hamid",
        name: "marteau de forge",
        description: "Un lourd marteau en acier, le manche poli par des années d'usage. Clairement l'outil d'un maître.",
        locationId: "forge_hamid",
        ownerId: null,
        properties: { heavy: true },
      },
      minerai_fer: {
        id: "minerai_fer",
        name: "minerai de fer",
        description: "Un bloc de minerai brut, aux reflets gris-brun. Hamid le travaillera bientôt.",
        locationId: "forge_hamid",
        ownerId: null,
        properties: { heavy: true },
      },
      lanterne_rouille: {
        id: "lanterne_rouille",
        name: "lanterne rouillée",
        description: "Une vieille lanterne dont la rouille a mangé les bords. Elle brûle encore, faiblement.",
        locationId: "ferme_oumou",
        ownerId: null,
        properties: { lit: true },
      },
      panier_legumes: {
        id: "panier_legumes",
        name: "panier de légumes",
        description: "Un grand panier en osier rempli de carottes, de navets et d'herbes aromatiques fraîches.",
        locationId: null,
        ownerId: "oumou",
        properties: { edible: true },
      },
    },

    relations,

    time: {
      year: 1,
      season: "automne",
      day: 3,
      hour: 9,
      minute: 0,
    },
  };
}
