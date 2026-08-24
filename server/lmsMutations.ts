import { and, desc, eq } from "drizzle-orm";
import {
  aiReviews,
  assignments,
  finalReviews,
  rubricCriteria,
  rubrics,
  submissions,
  users,
  type AiCriterionScore,
  type PerformanceLevel,
} from "../drizzle/schema";
import { getDb } from "./db";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  return db;
}

export async function createAssignmentRecord(input: { courseId: number; title: string; instructions: string; dueAt: Date | null; maxAttempts: number; allowResubmission: boolean }) {
  const db = await database();
  const [assignment] = await db.insert(assignments).values({ ...input, status: "draft" }).$returningId();
  return assignment;
}

export async function setAssignmentStatusRecord(assignmentId: number, status: "draft" | "published" | "archived") {
  const db = await database();
  await db.update(assignments).set({ status }).where(eq(assignments.id, assignmentId));
}

export async function saveRubricRecord(input: {
  assignmentId: number;
  existingRubricId?: number;
  existingVersion?: number;
  title: string;
  instructions?: string;
  criteria: Array<{ title: string; description: string; weight: number; minScore: number; maxScore: number; performanceLevels: PerformanceLevel[] }>;
}) {
  const db = await database();
  let rubricId = input.existingRubricId;
  if (rubricId) {
    await db.update(rubrics).set({ title: input.title, instructions: input.instructions ?? null, version: (input.existingVersion ?? 1) + 1 }).where(eq(rubrics.id, rubricId));
    await db.delete(rubricCriteria).where(eq(rubricCriteria.rubricId, rubricId));
  } else {
    const [created] = await db.insert(rubrics).values({ assignmentId: input.assignmentId, title: input.title, instructions: input.instructions ?? null }).$returningId();
    rubricId = created.id;
  }
  await db.insert(rubricCriteria).values(input.criteria.map((criterion, position) => ({ ...criterion, rubricId: rubricId!, position: position + 1 })));
  return rubricId!;
}

export async function saveLearnerSubmissionRecord(input: { assignmentId: number; learnerId: number; content: string; submit: boolean; maxAttempts: number; allowResubmission: boolean }) {
  const db = await database();
  const previous = await db.select().from(submissions).where(and(eq(submissions.assignmentId, input.assignmentId), eq(submissions.learnerId, input.learnerId))).orderBy(desc(submissions.attempt)).limit(1);
  const last = previous[0];
  const canReplaceDraft = last?.status === "draft";
  const canResubmit = last?.status === "returned" && input.allowResubmission && last.attempt < input.maxAttempts;
  if (last && !canReplaceDraft && !canResubmit) throw new Error("Tidak ada kesempatan submission baru untuk tugas ini.");
  const attempt = canReplaceDraft ? last!.attempt : (last?.attempt ?? 0) + 1;
  const status = input.submit ? "submitted" as const : "draft" as const;
  if (canReplaceDraft) {
    await db.update(submissions).set({ content: input.content, status, submittedAt: input.submit ? new Date() : null }).where(eq(submissions.id, last!.id));
    return { id: last!.id, status, attempt };
  }
  const [created] = await db.insert(submissions).values({ assignmentId: input.assignmentId, learnerId: input.learnerId, content: input.content, attempt, status, submittedAt: input.submit ? new Date() : null }).$returningId();
  return { id: created.id, status, attempt };
}

export async function persistAiReviewRecord(input: { submissionId: number; createdById: number; rubricVersion: number; model: string; overallScore: number; criterionScores: AiCriterionScore[]; summary: string; strengths: string[]; improvementAreas: string[]; nextSteps: string[]; confidence: "low" | "medium" | "high"; needsHumanReview: boolean }) {
  const db = await database();
  const [review] = await db.insert(aiReviews).values(input).$returningId();
  await db.update(submissions).set({ status: input.needsHumanReview ? "needs_human_review" : "ai_reviewed" }).where(eq(submissions.id, input.submissionId));
  return review;
}

export async function persistFinalReviewRecord(input: { submissionId: number; reviewerId: number; decision: "approved" | "returned"; finalScore: number | null; feedback: string }) {
  const db = await database();
  await db.insert(finalReviews).values(input).onDuplicateKeyUpdate({ set: { reviewerId: input.reviewerId, decision: input.decision, finalScore: input.finalScore, feedback: input.feedback, createdAt: new Date() } });
  await db.update(submissions).set({ status: input.decision === "approved" ? "reviewed" : "returned" }).where(eq(submissions.id, input.submissionId));
}

export async function updateUserRoleRecord(userId: number, role: "super_admin" | "admin" | "user") {
  const db = await database();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserActiveRecord(userId: number, isActive: boolean) {
  const db = await database();
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}
