import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import {
  aiReviews,
  assignments,
  auditLogs,
  courseModules,
  courses,
  enrollments,
  finalReviews,
  lessonProgress,
  lessons,
  rubricCriteria,
  rubrics,
  submissions,
  users,
} from "../drizzle/schema";
import { generateAiReview } from "./aiReview";
import { AUDIT_ACTION } from "./audit";
import { emitReviewDecision, emitSubmissionReceived } from "./workflowEvents";
import {
  createAssignmentRecord,
  persistAiReviewRecord,
  persistFinalReviewRecord,
  saveLearnerSubmissionRecord,
  saveRubricRecord,
  setAssignmentStatusRecord,
  updateUserActiveRecord,
  updateUserRoleRecord,
} from "./lmsMutations";
import {
  createInAppNotification,
  createCourseRecord,
  createLessonRecord,
  createModuleRecord,
  enrollLearnerRecord,
  getAssignmentDetail,
  getCourseDetail,
  getCourseProgressForLearner,
  getDb,
  getUserById,
  hasCourseAccess,
  isCourseManager,
  listCoursesFor,
  listNotifications,
  markNotificationRead,
  recordAudit,
  updateCourseRecord,
  updateLessonRecord,
  updateModuleRecord,
} from "./db";
import { deliverTransactionalEmail } from "./notificationService";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";
import { rubricInputSchema } from "./validation";

const courseStatusSchema = z.enum(["draft", "published", "archived"]);
const submissionStatusSchema = z.enum(["draft", "submitted", "ai_reviewed", "needs_human_review", "reviewed", "returned"]);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database tidak tersedia." });
  return db;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 160);
}

async function assertCourseManager(courseId: number, actor: { id: number; role: "super_admin" | "admin" | "user" }) {
  if (!(await isCourseManager(courseId, actor))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak memiliki akses untuk mengelola kursus ini." });
  }
}

async function assertCourseAccess(courseId: number, actor: { id: number; role: "super_admin" | "admin" | "user" }) {
  if (!(await hasCourseAccess(courseId, actor))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak memiliki akses ke kursus ini." });
  }
}

async function notifyUser(input: {
  userId: number;
  type: "submission_received" | "review_approved" | "submission_returned";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  await createInAppNotification(input);
  const recipient = await getUserById(input.userId);
  if (recipient?.email) {
    await deliverTransactionalEmail({ to: recipient.email, subject: input.title, text: input.body });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const actor = ctx.user;
      if (actor.role === "super_admin") {
        const [userCount] = await db.select({ total: count() }).from(users);
        const [courseCount] = await db.select({ total: count() }).from(courses);
        const [reviewCount] = await db.select({ total: count() }).from(submissions)
          .where(inArray(submissions.status, ["submitted", "ai_reviewed", "needs_human_review"]));
        const activity = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8);
        return { role: actor.role, metrics: { users: userCount?.total ?? 0, courses: courseCount?.total ?? 0, pendingReviews: reviewCount?.total ?? 0 }, activity };
      }

      if (actor.role === "admin") {
        const adminCourses = await db.select().from(courses).where(eq(courses.ownerId, actor.id)).orderBy(desc(courses.updatedAt));
        const courseIds = adminCourses.map(course => course.id);
        const pendingReviews = courseIds.length
          ? await db.select({ total: count() }).from(submissions)
            .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
            .where(and(inArray(assignments.courseId, courseIds), inArray(submissions.status, ["submitted", "ai_reviewed", "needs_human_review"])))
          : [{ total: 0 }];
        const learnerCount = courseIds.length
          ? await db.select({ total: count() }).from(enrollments).where(inArray(enrollments.courseId, courseIds))
          : [{ total: 0 }];
        return { role: actor.role, metrics: { courses: adminCourses.length, learners: learnerCount[0]?.total ?? 0, pendingReviews: pendingReviews[0]?.total ?? 0 }, courses: adminCourses.slice(0, 5) };
      }

      const learnerCourseBase = await listCoursesFor(actor);
      const learnerCourses = await Promise.all(learnerCourseBase.map(async course => ({ ...course, progress: await getCourseProgressForLearner(course.id, actor.id) })));
      const assignmentsDue = learnerCourses.length
        ? await db.select().from(assignments).where(and(inArray(assignments.courseId, learnerCourses.map(course => course.id)), eq(assignments.status, "published"))).orderBy(assignments.dueAt).limit(5)
        : [];
      const approvedFeedback = await db.select({ review: finalReviews, submission: submissions, assignment: assignments })
        .from(finalReviews)
        .innerJoin(submissions, eq(finalReviews.submissionId, submissions.id))
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(and(eq(submissions.learnerId, actor.id), eq(finalReviews.decision, "approved")))
        .orderBy(desc(finalReviews.createdAt)).limit(3);
      return { role: actor.role, metrics: { courses: learnerCourses.length, upcomingAssignments: assignmentsDue.length, recentFeedback: approvedFeedback.length }, courses: learnerCourses.slice(0, 4), assignments: assignmentsDue, feedback: approvedFeedback };
    }),
  }),

  course: router({
    list: protectedProcedure.query(({ ctx }) => listCoursesFor(ctx.user)),
    detail: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertCourseAccess(input.courseId, ctx.user);
      const detail = await getCourseDetail(input.courseId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Kursus tidak ditemukan." });
      return detail;
    }),
    create: adminProcedure.input(z.object({ title: z.string().trim().min(3).max(180), summary: z.string().trim().min(10).max(3000) })).mutation(async ({ ctx, input }) => {
      const slug = `${slugify(input.title)}-${Date.now().toString(36)}`;
      const course = await createCourseRecord({ ownerId: ctx.user.id, title: input.title, summary: input.summary, slug });
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.courseCreated, entityType: "course", entityId: course.id, metadata: { title: input.title } });
      return { id: course.id };
    }),
    update: adminProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().trim().min(3).max(180), summary: z.string().trim().min(10).max(3000) })).mutation(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      await updateCourseRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.courseUpdated, entityType: "course", entityId: input.courseId });
      return { success: true };
    }),
    setStatus: adminProcedure.input(z.object({ courseId: z.number().int().positive(), status: courseStatusSchema })).mutation(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const db = await database();
      await db.update(courses).set({ status: input.status, publishedAt: input.status === "published" ? new Date() : null }).where(eq(courses.id, input.courseId));
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.courseStatusChanged, entityType: "course", entityId: input.courseId, metadata: { status: input.status } });
      return { success: true };
    }),
    addModule: adminProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const module = await createModuleRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: "course.module_added", entityType: "course_module", entityId: module.id, metadata: { courseId: input.courseId } });
      return { id: module.id };
    }),
    addLesson: adminProcedure.input(z.object({ moduleId: z.number().int().positive(), title: z.string().trim().min(2).max(180), content: z.string().trim().min(10).max(20000), estimatedMinutes: z.number().int().min(1).max(300).default(10) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const module = (await db.select().from(courseModules).where(eq(courseModules.id, input.moduleId)).limit(1))[0];
      if (!module) throw new TRPCError({ code: "NOT_FOUND", message: "Modul tidak ditemukan." });
      await assertCourseManager(module.courseId, ctx.user);
      const lesson = await createLessonRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: "course.lesson_added", entityType: "lesson", entityId: lesson.id, metadata: { courseId: module.courseId } });
      return { id: lesson.id };
    }),
    enroll: adminProcedure.input(z.object({ courseId: z.number().int().positive(), learnerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const db = await database();
      const learner = await getUserById(input.learnerId);
      if (!learner || learner.role !== "user" || !learner.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Learner aktif tidak ditemukan." });
      await enrollLearnerRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: "enrollment.created", entityType: "enrollment", metadata: input });
      return { success: true };
    }),
  }),

  management: router({
    courseContent: adminProcedure.input(z.object({ courseId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const detail = await getCourseDetail(input.courseId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Kursus tidak ditemukan." });
      return detail;
    }),
    updateModule: adminProcedure.input(z.object({ moduleId: z.number().int().positive(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const module = (await db.select().from(courseModules).where(eq(courseModules.id, input.moduleId)).limit(1))[0];
      if (!module) throw new TRPCError({ code: "NOT_FOUND", message: "Modul tidak ditemukan." });
      await assertCourseManager(module.courseId, ctx.user);
      await updateModuleRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: "course.module_updated", entityType: "course_module", entityId: input.moduleId });
      return { success: true };
    }),
    updateLesson: adminProcedure.input(z.object({ lessonId: z.number().int().positive(), title: z.string().trim().min(2).max(180), content: z.string().trim().min(10).max(20000), estimatedMinutes: z.number().int().min(1).max(300) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const row = (await db.select({ lesson: lessons, module: courseModules }).from(lessons).innerJoin(courseModules, eq(lessons.moduleId, courseModules.id)).where(eq(lessons.id, input.lessonId)).limit(1))[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Lesson tidak ditemukan." });
      await assertCourseManager(row.module.courseId, ctx.user);
      await updateLessonRecord(input);
      await recordAudit({ actorId: ctx.user.id, action: "course.lesson_updated", entityType: "lesson", entityId: input.lessonId });
      return { success: true };
    }),
    learners: adminProcedure.input(z.object({ courseId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const db = await database();
      const enrolled = await db.select({ enrollment: enrollments, learner: users }).from(enrollments).innerJoin(users, eq(enrollments.learnerId, users.id)).where(eq(enrollments.courseId, input.courseId)).orderBy(desc(enrollments.enrolledAt));
      const available = await db.select().from(users).where(and(eq(users.role, "user"), eq(users.isActive, true))).orderBy(users.name);
      return { enrolled, available };
    }),
    insights: adminProcedure.query(async ({ ctx }) => {
      const db = await database();
      const managedCourses = await listCoursesFor(ctx.user);
      const result = [] as Array<{ courseId: number; title: string; learners: number; lessonCount: number; completionEvents: number }>;
      for (const course of managedCourses) {
        const enrolledCount = (await db.select({ total: count() }).from(enrollments).where(and(eq(enrollments.courseId, course.id), eq(enrollments.status, "active"))))[0]?.total ?? 0;
        const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, course.id));
        const moduleIds = modules.map(module => module.id);
        const courseLessons = moduleIds.length ? await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, moduleIds)) : [];
        const lessonIds = courseLessons.map(lesson => lesson.id);
        const completions = lessonIds.length ? (await db.select({ total: count() }).from(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds)))[0]?.total ?? 0 : 0;
        result.push({ courseId: course.id, title: course.title, learners: enrolledCount, lessonCount: lessonIds.length, completionEvents: completions });
      }
      return result;
    }),
  }),

  learning: router({
    completeLesson: protectedProcedure.input(z.object({ lessonId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Hanya learner dapat menandai lesson selesai." });
      const db = await database();
      const lesson = (await db.select({ lesson: lessons, module: courseModules }).from(lessons).innerJoin(courseModules, eq(lessons.moduleId, courseModules.id)).where(eq(lessons.id, input.lessonId)).limit(1))[0];
      if (!lesson) throw new TRPCError({ code: "NOT_FOUND", message: "Lesson tidak ditemukan." });
      await assertCourseAccess(lesson.module.courseId, ctx.user);
      await db.insert(lessonProgress).values({ lessonId: input.lessonId, learnerId: ctx.user.id }).onDuplicateKeyUpdate({ set: { completedAt: new Date() } });
      return { success: true };
    }),
    progress: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertCourseAccess(input.courseId, ctx.user);
      const db = await database();
      return getCourseProgressForLearner(input.courseId, ctx.user.id);
    }),
  }),

  assignment: router({
    detail: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const detail = await getAssignmentDetail(input.assignmentId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Tugas tidak ditemukan." });
      await assertCourseAccess(detail.assignment.courseId, ctx.user);
      return detail;
    }),
    create: adminProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().trim().min(3).max(180), instructions: z.string().trim().min(10).max(20000), dueAt: z.date().optional(), maxAttempts: z.number().int().min(1).max(10).default(1), allowResubmission: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      await assertCourseManager(input.courseId, ctx.user);
      const assignment = await createAssignmentRecord({ ...input, dueAt: input.dueAt ?? null });
      await recordAudit({ actorId: ctx.user.id, action: "assignment.created", entityType: "assignment", entityId: assignment.id, metadata: { courseId: input.courseId } });
      return { id: assignment.id };
    }),
    setStatus: adminProcedure.input(z.object({ assignmentId: z.number().int().positive(), status: courseStatusSchema })).mutation(async ({ ctx, input }) => {
      const detail = await getAssignmentDetail(input.assignmentId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Tugas tidak ditemukan." });
      await assertCourseManager(detail.assignment.courseId, ctx.user);
      await setAssignmentStatusRecord(input.assignmentId, input.status);
      await recordAudit({ actorId: ctx.user.id, action: `assignment.${input.status}`, entityType: "assignment", entityId: input.assignmentId });
      return { success: true };
    }),
    saveRubric: adminProcedure.input(z.object({ assignmentId: z.number().int().positive(), rubric: rubricInputSchema })).mutation(async ({ ctx, input }) => {
      const detail = await getAssignmentDetail(input.assignmentId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Tugas tidak ditemukan." });
      await assertCourseManager(detail.assignment.courseId, ctx.user);
      const rubricId = await saveRubricRecord({ assignmentId: input.assignmentId, existingRubricId: detail.rubric?.id, existingVersion: detail.rubric?.version, ...input.rubric });
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.rubricUpdated, entityType: "rubric", entityId: rubricId, metadata: { assignmentId: input.assignmentId, criterionCount: input.rubric.criteria.length } });
      return { success: true };
    }),
  }),

  submission: router({
    mine: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Riwayat ini khusus learner." });
      const detail = await getAssignmentDetail(input.assignmentId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Tugas tidak ditemukan." });
      await assertCourseAccess(detail.assignment.courseId, ctx.user);
      const db = await database();
      const rows = await db.select({ submission: submissions, finalReview: finalReviews }).from(submissions)
        .leftJoin(finalReviews, eq(finalReviews.submissionId, submissions.id))
        .where(and(eq(submissions.assignmentId, input.assignmentId), eq(submissions.learnerId, ctx.user.id)))
        .orderBy(desc(submissions.attempt));
      return rows.map(row => ({
        ...row.submission,
        finalReview: row.finalReview && row.finalReview.decision === "approved" ? row.finalReview : null,
      }));
    }),
    save: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive(), content: z.string().trim().min(1).max(30000), submit: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Hanya learner dapat mengirim jawaban." });
      const detail = await getAssignmentDetail(input.assignmentId);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Tugas tidak ditemukan." });
      await assertCourseAccess(detail.assignment.courseId, ctx.user);
      let saved: Awaited<ReturnType<typeof saveLearnerSubmissionRecord>>;
      try {
        saved = await saveLearnerSubmissionRecord({ assignmentId: input.assignmentId, learnerId: ctx.user.id, content: input.content, submit: input.submit, maxAttempts: detail.assignment.maxAttempts, allowResubmission: detail.assignment.allowResubmission });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Submission tidak dapat disimpan." });
      }

      if (input.submit) {
        const db = await database();
        const course = (await db.select().from(courses).where(eq(courses.id, detail.assignment.courseId)).limit(1))[0];
        if (course) await emitSubmissionReceived({ notify: notifyUser, audit: recordAudit }, { adminId: course.ownerId, learnerId: ctx.user.id, assignmentId: input.assignmentId, assignmentTitle: detail.assignment.title, submissionId: saved.id, attempt: saved.attempt });
      }
      return { id: saved.id, status: saved.status };
    }),
  }),

  review: router({
    queue: adminProcedure.input(z.object({ status: submissionStatusSchema.optional(), confidence: z.enum(["low", "medium", "high"]).optional(), courseId: z.number().int().positive().optional(), from: z.date().optional(), to: z.date().optional() })).query(async ({ ctx, input }) => {
      const db = await database();
      const rows = await db.select({ submission: submissions, assignment: assignments, course: courses, aiReview: aiReviews, learner: users })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .innerJoin(courses, eq(assignments.courseId, courses.id))
        .innerJoin(users, eq(submissions.learnerId, users.id))
        .leftJoin(aiReviews, eq(aiReviews.submissionId, submissions.id))
        .orderBy(desc(submissions.submittedAt));
      return rows.filter(row => {
        if (ctx.user.role === "admin" && row.course.ownerId !== ctx.user.id) return false;
        if (input.courseId && row.course.id !== input.courseId) return false;
        if (input.status && row.submission.status !== input.status) return false;
        if (input.confidence && row.aiReview?.confidence !== input.confidence) return false;
        if (input.from && (!row.submission.submittedAt || row.submission.submittedAt < input.from)) return false;
        if (input.to && (!row.submission.submittedAt || row.submission.submittedAt > input.to)) return false;
        return true;
      });
    }),
    detail: adminProcedure.input(z.object({ submissionId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await database();
      const row = (await db.select({ submission: submissions, assignment: assignments, course: courses, learner: users, finalReview: finalReviews })
        .from(submissions).innerJoin(assignments, eq(submissions.assignmentId, assignments.id)).innerJoin(courses, eq(assignments.courseId, courses.id))
        .innerJoin(users, eq(submissions.learnerId, users.id)).leftJoin(finalReviews, eq(finalReviews.submissionId, submissions.id))
        .where(eq(submissions.id, input.submissionId)).limit(1))[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Submission tidak ditemukan." });
      await assertCourseManager(row.course.id, ctx.user);
      const ai = await db.select().from(aiReviews).where(eq(aiReviews.submissionId, input.submissionId)).orderBy(desc(aiReviews.createdAt)).limit(1);
      const rubric = await getAssignmentDetail(row.assignment.id);
      return { ...row, aiReview: ai[0] ?? null, rubric };
    }),
    generate: adminProcedure.input(z.object({ submissionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const row = (await db.select({ submission: submissions, assignment: assignments, course: courses })
        .from(submissions).innerJoin(assignments, eq(submissions.assignmentId, assignments.id)).innerJoin(courses, eq(assignments.courseId, courses.id))
        .where(eq(submissions.id, input.submissionId)).limit(1))[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Submission tidak ditemukan." });
      await assertCourseManager(row.course.id, ctx.user);
      if (row.submission.status !== "submitted" && row.submission.status !== "returned") throw new TRPCError({ code: "BAD_REQUEST", message: "Hanya submission yang siap direview dapat diproses AI." });
      const detail = await getAssignmentDetail(row.assignment.id);
      if (!detail?.rubric || !detail.criteria.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Rubrik aktif diperlukan sebelum review AI dijalankan." });
      const { review, model } = await generateAiReview({ assignmentTitle: row.assignment.title, assignmentInstructions: row.assignment.instructions, rubricInstructions: detail.rubric.instructions, criteria: detail.criteria, submissionText: row.submission.content });
      const created = await persistAiReviewRecord({ submissionId: input.submissionId, createdById: ctx.user.id, rubricVersion: detail.rubric.version, model, ...review });
      const status = review.needsHumanReview ? "needs_human_review" : "ai_reviewed";
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.aiReviewCreated, entityType: "ai_review", entityId: created.id, metadata: { submissionId: input.submissionId, model, confidence: review.confidence } });
      return { id: created.id, status, confidence: review.confidence };
    }),
    decide: adminProcedure.input(z.object({ submissionId: z.number().int().positive(), decision: z.enum(["approved", "returned"]), finalScore: z.number().int().min(0).max(100).nullable(), feedback: z.string().trim().min(5).max(5000) })).mutation(async ({ ctx, input }) => {
      if (input.decision === "approved" && input.finalScore === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Nilai final diperlukan untuk persetujuan." });
      const db = await database();
      const row = (await db.select({ submission: submissions, assignment: assignments, course: courses })
        .from(submissions).innerJoin(assignments, eq(submissions.assignmentId, assignments.id)).innerJoin(courses, eq(assignments.courseId, courses.id))
        .where(eq(submissions.id, input.submissionId)).limit(1))[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Submission tidak ditemukan." });
      await assertCourseManager(row.course.id, ctx.user);
      await persistFinalReviewRecord({ submissionId: input.submissionId, reviewerId: ctx.user.id, decision: input.decision, finalScore: input.decision === "approved" ? input.finalScore : null, feedback: input.feedback });
      await emitReviewDecision({ notify: notifyUser, audit: recordAudit }, { reviewerId: ctx.user.id, learnerId: row.submission.learnerId, assignmentId: row.assignment.id, assignmentTitle: row.assignment.title, submissionId: input.submissionId, decision: input.decision, finalScore: input.finalScore });
      return { success: true };
    }),
  }),

  feedback: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Halaman feedback ini khusus learner." });
      const db = await database();
      return db.select({ submission: submissions, assignment: assignments, course: courses, finalReview: finalReviews })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .innerJoin(courses, eq(assignments.courseId, courses.id))
        .leftJoin(finalReviews, eq(finalReviews.submissionId, submissions.id))
        .where(and(eq(submissions.learnerId, ctx.user.id), inArray(submissions.status, ["reviewed", "returned"])))
        .orderBy(desc(submissions.updatedAt));
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await markNotificationRead(ctx.user.id, input.notificationId);
      return { success: true };
    }),
  }),

  users: router({
    list: superAdminProcedure.input(z.object({ query: z.string().trim().max(100).optional() })).query(async ({ input }) => {
      const db = await database();
      if (!input.query) return db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
      const needle = `%${input.query}%`;
      return db.select().from(users).where(like(users.name, needle)).orderBy(desc(users.createdAt)).limit(100);
    }),
    setRole: superAdminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["super_admin", "admin", "user"]) })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && input.role !== "super_admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Anda tidak dapat menurunkan role Super Admin sendiri." });
      await updateUserRoleRecord(input.userId, input.role);
      await recordAudit({ actorId: ctx.user.id, action: AUDIT_ACTION.roleChanged, entityType: "user", entityId: input.userId, metadata: { role: input.role } });
      return { success: true };
    }),
    setActive: superAdminProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Anda tidak dapat menonaktifkan akun sendiri." });
      await updateUserActiveRecord(input.userId, input.isActive);
      await recordAudit({ actorId: ctx.user.id, action: "user.status_changed", entityType: "user", entityId: input.userId, metadata: { isActive: input.isActive } });
      return { success: true };
    }),
    audit: superAdminProcedure.query(async () => {
      const db = await database();
      return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    }),
  }),
});

export type AppRouter = typeof appRouter;
