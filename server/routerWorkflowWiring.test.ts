import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("router workflow wiring", () => {
  it("routes learner submission through the submission notification and audit workflow", async () => {
    const source = await readFile(new URL("./routers.ts", import.meta.url), "utf8");
    expect(source).toContain("emitSubmissionReceived({ notify: notifyUser, audit: recordAudit }");
    expect(source).toContain("assignmentTitle: detail.assignment.title");
  });

  it("routes final approval and returned-for-revision decisions through the review workflow", async () => {
    const source = await readFile(new URL("./routers.ts", import.meta.url), "utf8");
    expect(source).toContain("emitReviewDecision({ notify: notifyUser, audit: recordAudit }");
    expect(source).toContain("decision: input.decision");
  });
});
