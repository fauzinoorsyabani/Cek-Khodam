import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_AUDIT_ACTIONS } from "./audit";
import { deliverTransactionalEmail } from "./notificationService";
import { rubricInputSchema } from "./validation";
import { submissionStatuses } from "../drizzle/schema";

const savedEmailConfig = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };

afterEach(() => {
  process.env.RESEND_API_KEY = savedEmailConfig.key;
  process.env.RESEND_FROM_EMAIL = savedEmailConfig.from;
});

describe("LMS contracts", () => {
  it("defines the complete learner submission lifecycle", () => {
    expect(submissionStatuses).toEqual([
      "draft",
      "submitted",
      "ai_reviewed",
      "needs_human_review",
      "reviewed",
      "returned",
    ]);
  });

  it("rejects rubrics whose criterion weights do not total 100%", () => {
    const result = rubricInputSchema.safeParse({
      title: "Rubrik", instructions: "Gunakan rubrik.",
      criteria: [{ title: "Analisis", description: "Kualitas analisis dan bukti yang digunakan.", weight: 90, minScore: 0, maxScore: 100, performanceLevels: [{ name: "Dasar", description: "Masih perlu penguatan.", score: 40 }, { name: "Baik", description: "Memenuhi ekspektasi.", score: 80 }] }],
    });
    expect(result.success).toBe(false);
  });

  it("keeps email delivery fail-soft while credentials have not been configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await expect(deliverTransactionalEmail({ to: "learner@example.com", subject: "Review", text: "Feedback tersedia." })).resolves.toEqual({ delivered: false, reason: "not_configured" });
  });

  it("declares every audit category mandated for sensitive LMS actions", () => {
    expect(REQUIRED_AUDIT_ACTIONS).toEqual(expect.arrayContaining([
      "user.role_changed", "course.created", "course.updated", "rubric.updated", "ai_review.created", "grade.approved",
    ]));
  });
});
