import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../src/parseMarkdown.js";

describe("parseMarkdown", () => {
  it("extracts title and body correctly", () => {
    const page = parseMarkdown(
      "sample.md",
      `---
description: Test description
---

# Choose the right thing

This body has **useful** guidance.

## Second section [anchor]

More text with [a link](/docs/example.md).
`
    );

    expect(page.title).toBe("Choose the right thing");
    expect(page.description).toBe("Test description");
    expect(page.headings).toEqual(["Choose the right thing", "Second section"]);
    expect(page.body).toContain("This body has useful guidance");
    expect(page.body).toContain("a link");
  });
});
