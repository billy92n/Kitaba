// persistence/schema.ts — Réexporte le schéma DB depuis lib/db.
// Point d'import unique pour tous les modules de persistence.

export {
  kitabaSessionsTable,
  kitabaEventsTable,
  kitabaSavesTable,
  type KitabaSession,
  type KitabaEvent,
  type KitabaSave,
  type InsertKitabaSession,
  type InsertKitabaEvent,
  type InsertKitabaSave,
} from "@workspace/db";
