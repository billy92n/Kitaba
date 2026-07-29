import type { GameEvent } from "../domain/events.js";
import type { WorldState } from "../domain/world.js";
import type { NarrativeEntry } from "../persistence/types.js";

export interface ActionCommit {
  sessionId: string;
  expectedWorldVersion: number;
  expectedNarrativeHistory: readonly NarrativeEntry[];
  newWorldState: WorldState;
  narrativeHistory: NarrativeEntry[];
  event: GameEvent;
  autoSaveId: string;
}

export type ActionCommitResult = "COMMITTED" | "CONFLICT";

export interface ActionCommitPort {
  tryCommit(actionCommit: ActionCommit): Promise<ActionCommitResult>;
}

export class WorldVersionConflictError extends Error {
  readonly code = "WORLD_VERSION_CONFLICT";

  constructor(
    readonly sessionId: string,
    readonly expectedWorldVersion: number,
  ) {
    super(
      `La session ${sessionId} n'est plus à la version ${expectedWorldVersion}.`,
    );
    this.name = "WorldVersionConflictError";
  }
}

export async function commitAction(
  actionCommit: ActionCommit,
  port: ActionCommitPort,
): Promise<void> {
  const result = await port.tryCommit(actionCommit);
  if (result === "CONFLICT") {
    throw new WorldVersionConflictError(
      actionCommit.sessionId,
      actionCommit.expectedWorldVersion,
    );
  }
}
