// kitaba.ts — Schéma PostgreSQL pour le jeu Kitaba.
// Le monde réel vit ici. Le LLM ne possède jamais ces données.

import { pgTable, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Sessions ──────────────────────────────────────────────────────────────────
// Une session = une partie en cours. Le controlledEntityId désigne le personnage
// joué par l'utilisateur — c'est une entité ordinaire du monde, sans statut spécial.

export const kitabaSessionsTable = pgTable("kitaba_sessions", {
  id: text("id").primaryKey(),
  controlledEntityId: text("controlled_entity_id").notNull(),
  worldVersion: integer("world_version").notNull().default(0),
  worldState: jsonb("world_state").notNull(),
  narrativeHistory: jsonb("narrative_history").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Journal d'événements ───────────────────────────────────────────────────────
// Chaque action réussie crée un événement persistant.
// Ce journal est séparé des snapshots du monde.

export const kitabaEventsTable = pgTable("kitaba_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  worldVersion: integer("world_version").notNull(),
  actionType: text("action_type").notNull(),
  actorId: text("actor_id").notNull(),
  locationId: text("location_id").notNull(),
  targetId: text("target_id"),
  description: text("description").notNull(),
  // Enveloppe JSONB : changements réels + données d'observation typées.
  // Les anciennes lignes string[] restent lisibles sans migration SQL.
  consequences: jsonb("consequences").notNull(),
  occurredAt: jsonb("occurred_at").notNull(), // WorldTime
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Sauvegardes ───────────────────────────────────────────────────────────────
// saveType "auto" = sauvegarde automatique après chaque action.
// saveType "manual" = sauvegarde nommée par le joueur.
// Le chargement d'une sauvegarde crée TOUJOURS une nouvelle session (branchement),
// jamais un écrasement silencieux de la session courante.

export const kitabaSavesTable = pgTable("kitaba_saves", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  parentSessionId: text("parent_session_id"), // session dont cette save est issue
  saveType: text("save_type").notNull().default("manual"), // "auto" | "manual"
  saveName: text("save_name").notNull(),
  controlledEntityId: text("controlled_entity_id").notNull(),
  worldVersion: integer("world_version").notNull(),
  worldState: jsonb("world_state").notNull(),
  narrativeHistory: jsonb("narrative_history").notNull(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

// ─── Schémas Zod dérivés ────────────────────────────────────────────────────────

export const insertKitabaSessionSchema =
  createInsertSchema(kitabaSessionsTable);
export const insertKitabaEventSchema = createInsertSchema(kitabaEventsTable);
export const insertKitabaSaveSchema = createInsertSchema(kitabaSavesTable);

export type KitabaSession = typeof kitabaSessionsTable.$inferSelect;
export type InsertKitabaSession = z.infer<typeof insertKitabaSessionSchema>;
export type KitabaEvent = typeof kitabaEventsTable.$inferSelect;
export type InsertKitabaEvent = z.infer<typeof insertKitabaEventSchema>;
export type KitabaSave = typeof kitabaSavesTable.$inferSelect;
export type InsertKitabaSave = z.infer<typeof insertKitabaSaveSchema>;
