import { describe, expect, it } from "vitest";
import {
  deserializeEventDetails,
  type StoredEventDetails,
} from "../domain/events.js";

describe("stored event details compatibility", () => {
  it("accepts a fully validated structured event envelope", () => {
    const details: StoredEventDetails = {
      changes: ["world changed"],
      observations: [{ audience: "LOCATION", text: "Something happened." }],
      requestedTargetName: "target",
      status: "APPLIED",
    };
    expect(deserializeEventDetails(details, "legacy")).toBe(details);
  });

  it("falls back to an actor-only legacy observation for malformed JSONB", () => {
    expect(
      deserializeEventDetails(
        {
          changes: ["private"],
          observations: [{ audience: "PUBLIC", text: 42 }],
          requestedTargetName: "secret",
          status: "APPLIED",
        },
        "Legacy safe description",
      ),
    ).toEqual({
      changes: [],
      observations: [{ audience: "ACTOR", text: "Legacy safe description" }],
      requestedTargetName: null,
      status: "APPLIED",
    });
  });

  it("keeps historical string arrays readable and their rejection status", () => {
    expect(
      deserializeEventDetails(
        ["first", 42, "second"],
        "[BLOQUÉ] legacy refusal",
      ),
    ).toEqual({
      changes: ["first", "second"],
      observations: [{ audience: "ACTOR", text: "[BLOQUÉ] legacy refusal" }],
      requestedTargetName: null,
      status: "REJECTED",
    });
  });
});
