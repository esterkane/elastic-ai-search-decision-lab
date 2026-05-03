import { describe, expect, it } from "vitest";
import { buildSearchProfile } from "../src/buildSearchProfile.js";

describe("buildSearchProfile", () => {
  it("handles missing metadata", () => {
    const profile = buildSearchProfile({ title: "Sparse page" });

    expect(profile).toContain("Sparse page");
    expect(profile).toContain("practitioners");
    expect(profile).toContain("AI search");
  });
});
