import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  aiReviews, assignments, auditLogs, courseModules, courses, enrollments, finalReviews,
  lessonProgress, lessons, notifications, rubricCriteria, rubrics, submissions, users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const runE2e = process.env.RUN_LMS_E2E === "1" ? describe : describe.skip;
const runId = `e2e-${Date.now()}`;
const emailDomain = `${runId}.test`;
let admin: typeof users.$inferSelect;
let learnerOne: typeof users.$inferSelect;
let learnerTwo: typeof users.$inferSelect;
let courseId = 0;
let assignmentId = 0;
let lessonId = 0;
let submissionId = 0;
let approvedSubmissionId = 0;

function contextFor(user: typeof users.$inferSelect): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

async function insertUser(input: { name: string; role: "admin" | "user" }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia untuk uji E2E.");
  const [created] = await db.insert(users).values({
    openId: `${runId}-${input.role}-${input.name.toLowerCase().replaceAll(" ", "-")}`,
    name: input.name,
    email: `${input.name.toLowerCase().replaceAll(" ", ".")}@${emailDomain}`,
    loginMethod: "e2e-test",
    role: input.role,
    isActive: true,
  }).$returningId();
  const row = (await db.select().from(users).where(eq(users.id, created.id)).limit(1))[0];
  if (!row) throw new Error("User uji tidak dapat dibuat.");
  return row;
}

runE2e("LMS end-to-end isolated workflow", () => {
  beforeAll(async () => {
    admin = await insertUser({ name: "E2E Admin", role: "admin" });
    learnerOne = await insertUser({ name: "E2E Learner One", role: "user" });
    learnerTwo = await insertUser({ name: "E2E Learner Two", role: "user" });
  });

  it("creates a course, enrolls two learners, and records lesson progress", async () => {
    const adminCaller = appRouter.createCaller(contextFor(admin));
    const course = await adminCaller.course.create({ title: `Uji LMS ${runId}`, summary: "Kursus uji terisolasi untuk memvalidasi alur pembelajaran dan akses berbasis peran." });
    courseId = course.id;
    const module = await adminCaller.course.addModule({ courseId, title: "Modul validasi", description: "Struktur materi untuk uji alur." });
    const lesson = await adminCaller.course.addLesson({ moduleId: module.id, title: "Lesson validasi", content: "Konten internal untuk memeriksa progress learner.", estimatedMinutes: 5 });
    lessonId = lesson.id;
    await adminCaller.course.enroll({ courseId, learnerId: learnerOne.id });
    await adminCaller.course.enroll({ courseId, learnerId: learnerTwo.id });
    await adminCaller.course.setStatus({ courseId, status: "published" });

    const learnerCaller = appRouter.createCaller(contextFor(learnerOne));
    await learnerCaller.learning.completeLesson({ lessonId });
    const progress = await learnerCaller.learning.progress({ courseId });
    expect(progress).toMatchObject({ completed: 1, total: 1, percentage: 100 });
  }, 60_000);

  it("validates assignment, rubric, learner submission, AI review, return, resubmission, and approval", async () => {
    const adminCaller = appRouter.createCaller(contextFor(admin));
    const assignment = await adminCaller.assignment.create({
      courseId,
      title: "Tugas validasi analisis",
      instructions: "Jelaskan alasan Anda memilih pendekatan analisis dan sertakan minimal dua bukti dari materi.",
      maxAttempts: 2,
      allowResubmission: true,
    });
    assignmentId = assignment.id;
    await adminCaller.assignment.saveRubric({
      assignmentId,
      rubric: {
        title: "Rubrik validasi", instructions: "Nilai berdasarkan ketepatan analisis dan bukti yang digunakan.",
        criteria: [{ title: "Analisis", description: "Menjelaskan alasan dengan bukti relevan dari materi pembelajaran.", weight: 100, minScore: 0, maxScore: 100, performanceLevels: [{ name: "Perlu perbaikan", description: "Analisis belum didukung bukti yang cukup.", score: 40 }, { name: "Memadai", description: "Analisis jelas dan didukung bukti relevan.", score: 80 }] }],
      },
    });
    await adminCaller.assignment.setStatus({ assignmentId, status: "published" });

    const learnerCaller = appRouter.createCaller(contextFor(learnerOne));
    const draft = await learnerCaller.submission.save({ assignmentId, content: "Draf uji internal untuk memastikan penyimpanan jawaban bekerja.", submit: false });
    expect(draft.status).toBe("draft");
    const submitted = await learnerCaller.submission.save({ assignmentId, content: "Jawaban uji internal menjelaskan pendekatan analisis dengan dua bukti dari materi yang relevan.", submit: true });
    submissionId = submitted.id;
    expect(submitted.status).toBe("submitted");

    const generated = await adminCaller.review.generate({ submissionId });
    expect(["ai_reviewed", "needs_human_review"]).toContain(generated.status);
    await adminCaller.review.decide({ submissionId, decision: "returned", finalScore: null, feedback: "Tambahkan hubungan yang lebih eksplisit antara dua bukti dan kesimpulan Anda." });
    const returned = await learnerCaller.submission.mine({ assignmentId });
    expect(returned[0]?.status).toBe("returned");

    const resubmitted = await learnerCaller.submission.save({ assignmentId, content: "Revisi uji internal menghubungkan kedua bukti secara eksplisit dengan kesimpulan analisis.", submit: true });
    approvedSubmissionId = resubmitted.id;
    const attempts = await learnerCaller.submission.mine({ assignmentId });
    expect(attempts.some(item => item.id === resubmitted.id && item.attempt === 2 && item.status === "submitted")).toBe(true);
    await adminCaller.review.decide({ submissionId: resubmitted.id, decision: "approved", finalScore: 88, feedback: "Struktur analisis telah memenuhi kriteria rubrik." });
    const feedback = await learnerCaller.feedback.list();
    expect(feedback.some(item => item.submission.id === resubmitted.id && item.finalReview?.decision === "approved")).toBe(true);
  }, 180_000);

  it("confirms role enforcement, notifications, and audit history", async () => {
    const learnerCaller = appRouter.createCaller(contextFor(learnerOne));
    await expect(learnerCaller.review.queue({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const adminNotifications = await appRouter.createCaller(contextFor(admin)).notifications.list();
    const learnerNotifications = await learnerCaller.notifications.list();
    expect(adminNotifications.some(item => item.type === "submission_received")).toBe(true);
    expect(learnerNotifications.some(item => item.type === "submission_returned")).toBe(true);
    expect(learnerNotifications.some(item => item.type === "review_approved")).toBe(true);

    const db = await getDb();
    if (!db) throw new Error("Database tidak tersedia untuk verifikasi.");
    const audits = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [courseId, assignmentId, submissionId, approvedSubmissionId]));
    expect(audits.some(item => item.action === "course.created")).toBe(true);
    expect(audits.some(item => item.action === "rubric.updated")).toBe(true);
    expect(audits.some(item => item.action === "ai_review.created")).toBe(true);
    expect(audits.some(item => item.action === "grade.approved")).toBe(true);
  }, 60_000);

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const userIds = [admin.id, learnerOne.id, learnerTwo.id].filter(Boolean);
    const courseIds = courseId ? [courseId] : [];
    const assignmentIds = assignmentId ? [assignmentId] : [];
    const moduleRows = courseIds.length ? await db.select({ id: courseModules.id }).from(courseModules).where(inArray(courseModules.courseId, courseIds)) : [];
    const moduleIds = moduleRows.map(row => row.id);
    const lessonRows = moduleIds.length ? await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, moduleIds)) : [];
    const lessonIds = lessonRows.map(row => row.id);
    const submissionRows = assignmentIds.length ? await db.select({ id: submissions.id }).from(submissions).where(inArray(submissions.assignmentId, assignmentIds)) : [];
    const submissionIds = submissionRows.map(row => row.id);
    const rubricRows = assignmentIds.length ? await db.select({ id: rubrics.id }).from(rubrics).where(inArray(rubrics.assignmentId, assignmentIds)) : [];
    const rubricIds = rubricRows.map(row => row.id);
    if (submissionIds.length) { await db.delete(aiReviews).where(inArray(aiReviews.submissionId, submissionIds)); await db.delete(finalReviews).where(inArray(finalReviews.submissionId, submissionIds)); await db.delete(submissions).where(inArray(submissions.id, submissionIds)); }
    if (rubricIds.length) await db.delete(rubricCriteria).where(inArray(rubricCriteria.rubricId, rubricIds));
    if (assignmentIds.length) { await db.delete(rubrics).where(inArray(rubrics.assignmentId, assignmentIds)); await db.delete(assignments).where(inArray(assignments.id, assignmentIds)); }
    if (lessonIds.length) { await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds)); await db.delete(lessons).where(inArray(lessons.id, lessonIds)); }
    if (moduleIds.length) await db.delete(courseModules).where(inArray(courseModules.id, moduleIds));
    if (courseIds.length) { await db.delete(enrollments).where(inArray(enrollments.courseId, courseIds)); await db.delete(courses).where(inArray(courses.id, courseIds)); }
    if (userIds.length) { await db.delete(notifications).where(inArray(notifications.userId, userIds)); await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds)); await db.delete(users).where(inArray(users.id, userIds)); }
  });
});
