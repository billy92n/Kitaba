// domain/relations.ts — Relations entre entités du monde.

export interface Relation {
  entityAId: string;
  entityBId: string;
  type: string;    // e.g. "ami", "maître-apprenti", "commerçant", "voisin"
  strength: number; // 0-100
  notes: string;
}
