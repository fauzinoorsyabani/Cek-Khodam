import { describe, expect, it, vi } from "vitest";
import { emitReviewDecision, emitSubmissionReceived } from "./workflowEvents";

describe("LMS workflow events", () => {
  it("creates an Admin notification and learner-submission audit event", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    await emitSubmissionReceived({ notify, audit }, { adminId: 1, learnerId: 2, assignmentId: 3, assignmentTitle: "Analisis data", submissionId: 4, attempt: 2 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, type: "submission_received", data: { submissionId: 4, assignmentId: 3 } }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 2, action: "submission.submitted", entityType: "submission", entityId: 4 }));
  });

  it("creates a learner notification and approval audit event for final approval", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    await emitReviewDecision({ notify, audit }, { reviewerId: 1, learnerId: 2, assignmentId: 3, assignmentTitle: "Analisis data", submissionId: 4, decision: "approved", finalScore: 91 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 2, type: "review_approved" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 1, action: "grade.approved", metadata: { finalScore: 91 } }));
  });

  it("creates a return notification and revision audit event when Admin asks for changes", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    await emitReviewDecision({ notify, audit }, { reviewerId: 1, learnerId: 2, assignmentId: 3, assignmentTitle: "Analisis data", submissionId: 4, decision: "returned", finalScore: null });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "submission_returned" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "submission.returned", metadata: { finalScore: null } }));
  });
});
