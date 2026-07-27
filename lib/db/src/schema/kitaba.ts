import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const kitabaSessionsTable = pgTable("kitaba_sessions", {
  id: text("id").primaryKey(),
  playerName: text("player_name").notNull(),
  worldState: jsonb("world_state").notNull(),
  narrativeHistory: jsonb("narrative_history").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kitabaSavesTable = pgTable("kitaba_saves", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  saveName: text("save_name").notNull(),
  playerName: text("player_name").notNull(),
  worldState: jsonb("world_state").notNull(),
  narrativeHistory: jsonb("narrative_history").notNull(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

export const insertKitabaSessionSchema = createInsertSchema(kitabaSessionsTable);
export const insertKitabaSaveSchema = createInsertSchema(kitabaSavesTable);

export type KitabaSession = typeof kitabaSessionsTable.$inferSelect;
export type InsertKitabaSession = z.infer<typeof insertKitabaSessionSchema>;
export type KitabaSave = typeof kitabaSavesTable.$inferSelect;
export type InsertKitabaSave = z.infer<typeof insertKitabaSaveSchema>;
