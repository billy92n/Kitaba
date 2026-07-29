// worldSeed.ts â€” DonnÃ©es initiales fixes du monde de Kitaba.
// Le personnage contrÃ´lÃ© par le joueur utilise exactement le mÃªme modÃ¨le Entity qu'un PNJ.
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
    description: `Un voyageur nouvellement arrivÃ© Ã  Salma. Son regard est curieux, ses pas encore hÃ©sitants sur les pavÃ©s du village.`,
    mood: "curieux",
    inventory: [],
    // Stats vitales â€” optionnelles pour les PNJ, prÃ©sentes ici car entitÃ© contrÃ´lÃ©e
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
      description: "Un homme trapu aux mains calleuses et au regard direct. Forgeron de pÃ¨re en fils, il est respectÃ© de tous Ã  Salma. Il parle peu mais chaque mot compte.",
      mood: "concentrÃ©",
      inventory: [],
    },
    oumou: {
      id: "oumou",
      name: "Oumou",
      occupation: "Paysanne",
      locationId: "ferme_oumou",
      description: "Une femme d'une cinquantaine d'annÃ©es, vive et chaleureuse. Elle connaÃ®t tout le monde et n'hÃ©site pas Ã  partager nouvelles et conseils. Sa ferme est la plus productive du village.",
      mood: "affable",
      inventory: ["panier_legumes"],
    },
    tariq: {
      id: "tariq",
      name: "Tariq",
      occupation: "Aubergiste",
      locationId: "taverne_du_loup",
      description: "Un homme jovial au ventre gÃ©nÃ©reux et Ã  la barbe fournie. Il tient la Taverne du Loup Gris depuis vingt ans et connaÃ®t plus de secrets que n'importe quel curÃ©.",
      mood: "jovial",
      inventory: ["pain_taverne"],
    },
    leila: {
      id: "leila",
      name: "Leila",
      occupation: "Marchande",
      locationId: "taverne_du_loup",
      description: "Une femme Ã©lÃ©gante venue de la citÃ©, aux vÃªtements de qualitÃ© et au regard calculateur. Elle nÃ©gocie en silence, observe tout, et ne rÃ©vÃ¨le jamais ses intentions.",
      mood: "mÃ©fiant",
      inventory: [],
    },
    amir: {
      id: "amir",
      name: "Amir",
      occupation: "Apprenti forgeron",
      locationId: "forge_hamid",
      description: "Un jeune homme de dix-sept ans, les bras maigres mais les yeux brillants d'ambition. Il apprend le mÃ©tier de Hamid depuis deux ans.",
      mood: "enthousiaste",
      inventory: [],
    },
  };

  const relations: Relation[] = [
    { entityAId: "hamid", entityBId: "amir",  type: "maÃ®tre-apprenti",    strength: 75, notes: "Hamid est exigeant mais bienveillant. Amir l'admire profondÃ©ment." },
    { entityAId: "tariq", entityBId: "oumou", type: "vieille amitiÃ©",     strength: 85, notes: "Ils se connaissent depuis l'enfance. Oumou fournit des lÃ©gumes Ã  la taverne." },
    { entityAId: "hamid", entityBId: "oumou", type: "voisinage",          strength: 60, notes: "Ils se respectent sans Ãªtre proches. Hamid rÃ©pare les outils de la ferme." },
    { entityAId: "leila", entityBId: "tariq", type: "relation commerciale", strength: 45, notes: "Leila loge Ã  la taverne lors de ses passages. Tariq la trouve mystÃ©rieuse." },
    { entityAId: "amir",  entityBId: "leila", type: "curiositÃ© mutuelle", strength: 30, notes: "Amir l'aborde souvent pour avoir des nouvelles de la citÃ©. Elle rÃ©pond vaguement." },
  ];

  return {
    worldVersion: 0,
    controlledEntityId: playerId,

    locations: {
      place_centrale: {
        id: "place_centrale",
        name: "Place centrale de Salma",
        description: "Le cÅ“ur du village de Salma. Une fontaine ancienne trÃ´ne au milieu de pavÃ©s irrÃ©guliers. Les villageois s'y croisent au fil de la journÃ©e. Les maisons aux murs de terre ocre forment un cercle rassurant.",
        connectedLocations: ["taverne_du_loup", "forge_hamid", "ferme_oumou"],
        presentEntities: [playerId],
        presentObjects: ["vieille_enseigne"],
      },
      taverne_du_loup: {
        id: "taverne_du_loup",
        name: "Taverne du Loup Gris",
        description: "Une salle basse et enfumÃ©e oÃ¹ l'odeur de biÃ¨re et de ragoÃ»t se mÃªle Ã  celle du bois brÃ»lÃ©. Des tables en chÃªne Ã©pais, une cheminÃ©e toujours allumÃ©e. Tariq, le patron, essuie ses verres derriÃ¨re le comptoir.",
        connectedLocations: ["place_centrale"],
        presentEntities: ["tariq", "leila"],
        presentObjects: ["lanterne_taverne"],
      },
      forge_hamid: {
        id: "forge_hamid",
        name: "Forge de Hamid",
        description: "Le bruit du marteau sur l'enclume s'entend depuis la place. La chaleur du four frappe comme un mur dÃ¨s l'entrÃ©e. Des outils soigneusement rangÃ©s couvrent les murs. Hamid travaille ici depuis trente ans.",
        connectedLocations: ["place_centrale"],
        presentEntities: ["hamid", "amir"],
        presentObjects: ["marteau_hamid", "minerai_fer"],
      },
      ferme_oumou: {
        id: "ferme_oumou",
        name: "Ferme d'Oumou",
        description: "Un domaine modeste mais bien tenu, Ã  la lisiÃ¨re du village. Des poules picorent entre les rangÃ©es de lÃ©gumes. Une vieille lanterne rouillÃ©e pend Ã  l'entrÃ©e de la grange. Oumou y travaille du lever au coucher du soleil.",
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
        description: "Une enseigne en bois sculptÃ© reprÃ©sentant un loup hurlant, suspendue au-dessus de l'entrÃ©e de la taverne. La peinture s'Ã©caille par endroits.",
        locationId: "place_centrale",
        ownerId: null,
        properties: {},
      },
      pain_taverne: {
        id: "pain_taverne",
        name: "miche de pain",
        description: "Un pain rond Ã  la croÃ»te Ã©paisse, encore tiÃ¨de. L'odeur est irrÃ©sistible.",
        locationId: null,
        ownerId: "tariq",
        properties: { edible: true },
      },
      lanterne_taverne: {
        id: "lanterne_taverne",
        name: "lanterne de la taverne",
        description: "Une lanterne en fer forgÃ© qui diffuse une lumiÃ¨re chaude et vacillante.",
        locationId: "taverne_du_loup",
        ownerId: null,
        properties: { lit: true },
      },
      marteau_hamid: {
        id: "marteau_hamid",
        name: "marteau de forge",
        description: "Un lourd marteau en acier, le manche poli par des annÃ©es d'usage. Clairement l'outil d'un maÃ®tre.",
        locationId: "forge_hamid",
        ownerId: null,
        properties: { heavy: true },
      },
      minerai_fer: {
        id: "minerai_fer",
        name: "minerai de fer",
        description: "Un bloc de minerai brut, aux reflets gris-brun. Hamid le travaillera bientÃ´t.",
        locationId: "forge_hamid",
        ownerId: null,
        properties: { heavy: true },
      },
      lanterne_rouille: {
        id: "lanterne_rouille",
        name: "lanterne rouillÃ©e",
        description: "Une vieille lanterne dont la rouille a mangÃ© les bords. Elle brÃ»le encore, faiblement.",
        locationId: "ferme_oumou",
        ownerId: null,
        properties: { lit: true },
      },
      panier_legumes: {
        id: "panier_legumes",
        name: "panier de lÃ©gumes",
        description: "Un grand panier en osier rempli de carottes, de navets et d'herbes aromatiques fraÃ®ches.",
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

