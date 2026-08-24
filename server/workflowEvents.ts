type NotificationPayload = {
  userId: number;
  type: "submission_received" | "review_approved" | "submission_returned";
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type AuditPayload = { actorId: number; action: string; entityType: string; entityId?: number; metadata?: Record<string, unknown> };

export type WorkflowDependencies = {
  notify: (payload: NotificationPayload) => Promise<unknown>;
  audit: (payload: AuditPayload) => Promise<unknown>;
};

export async function emitSubmissionReceived(
  dependencies: WorkflowDependencies,
  input: { adminId: number; learnerId: number; assignmentId: number; assignmentTitle: string; submissionId: number; attempt: number },
) {
  await dependencies.notify({ userId: input.adminId, type: "submission_received", title: "Submission baru masuk", body: `Ada submission baru untuk tugas “${input.assignmentTitle}”.`, data: { submissionId: input.submissionId, assignmentId: input.assignmentId } });
  await dependencies.audit({ actorId: input.learnerId, action: "submission.submitted", entityType: "submission", entityId: input.submissionId, metadata: { assignmentId: input.assignmentId, attempt: input.attempt } });
}

export async function emitReviewDecision(
  dependencies: WorkflowDependencies,
  input: { reviewerId: number; learnerId: number; assignmentId: number; assignmentTitle: string; submissionId: number; decision: "approved" | "returned"; finalScore: number | null },
) {
  const approved = input.decision === "approved";
  await dependencies.notify({ userId: input.learnerId, type: approved ? "review_approved" : "submission_returned", title: approved ? "Review Anda telah disetujui" : "Submission perlu direvisi", body: approved ? `Feedback untuk “${input.assignmentTitle}” sudah tersedia.` : `Submission “${input.assignmentTitle}” telah dikembalikan untuk revisi.`, data: { submissionId: input.submissionId, assignmentId: input.assignmentId } });
  await dependencies.audit({ actorId: input.reviewerId, action: approved ? "grade.approved" : "submission.returned", entityType: "submission", entityId: input.submissionId, metadata: { finalScore: input.finalScore } });
}
