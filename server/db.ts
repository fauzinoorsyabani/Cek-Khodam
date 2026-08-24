import { and, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  aiReviews,
  assignments,
  auditLogs,
  courseModules,
  courses,
  enrollments,
  finalReviews,
  InsertUser,
  lessonProgress,
  lessons,
  notifications,
  rubricCriteria,
  rubrics,
  submissions,
  type User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "super_admin";
    updateSet.role = "super_admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function recordAudit(input: {
  actorId: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ ...input, entityId: input.entityId ?? null, metadata: input.metadata ?? null });
}

export async function isCourseManager(courseId: number, actor: Pick<User, "id" | "role">) {
  if (actor.role === "super_admin") return true;
  if (actor.role !== "admin") return false;
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ownerId, actor.id))).limit(1);
  return Boolean(result[0]);
}

export async function hasCourseAccess(courseId: number, actor: Pick<User, "id" | "role">) {
  if (await isCourseManager(courseId, actor)) return true;
  if (actor.role !== "user") return false;
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.learnerId, actor.id), eq(enrollments.status, "active"))).limit(1);
  return Boolean(result[0]);
}

export async function listCoursesFor(actor: Pick<User, "id" | "role">) {
  const db = await getDb();
  if (!db) return [];
  if (actor.role === "super_admin") return db.select().from(courses).orderBy(desc(courses.updatedAt));
  if (actor.role === "admin") return db.select().from(courses).where(eq(courses.ownerId, actor.id)).orderBy(desc(courses.updatedAt));
  const rows = await db.select({ course: courses }).from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.learnerId, actor.id), eq(enrollments.status, "active")))
    .orderBy(desc(courses.updatedAt));
  return rows.map(row => row.course);
}

export async function getCourseDetail(courseId: number) {
  const db = await getDb();
  if (!db) return null;
  const course = (await db.select().from(courses).where(eq(courses.id, courseId)).limit(1))[0];
  if (!course) return null;
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(courseModules.position);
  const moduleIds = modules.map(module => module.id);
  const lessonRows = moduleIds.length ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)).orderBy(lessons.position) : [];
  const assignmentRows = await db.select().from(assignments).where(eq(assignments.courseId, courseId)).orderBy(desc(assignments.updatedAt));
  return { course, modules, lessons: lessonRows, assignments: assignmentRows };
}

export async function getCourseProgressForLearner(courseId: number, learnerId: number) {
  const db = await getDb();
  if (!db) return { completed: 0, total: 0, percentage: 0 };
  const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, courseId));
  const moduleIds = modules.map(module => module.id);
  const lessonRows = moduleIds.length
    ? await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, moduleIds))
    : [];
  const lessonIds = lessonRows.map(lesson => lesson.id);
  const completed = lessonIds.length
    ? (await db.select({ total: count() }).from(lessonProgress).where(and(eq(lessonProgress.learnerId, learnerId), inArray(lessonProgress.lessonId, lessonIds))))[0]?.total ?? 0
    : 0;
  return { completed, total: lessonIds.length, percentage: lessonIds.length ? Math.round((completed / lessonIds.length) * 100) : 0 };
}

export async function createCourseRecord(input: { ownerId: number; title: string; summary: string; slug: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const [course] = await db.insert(courses).values({ ...input, status: "draft" }).$returningId();
  return course;
}

export async function updateCourseRecord(input: { courseId: number; title: string; summary: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(courses).set({ title: input.title, summary: input.summary }).where(eq(courses.id, input.courseId));
}

export async function createModuleRecord(input: { courseId: number; title: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const rows = await db.select({ total: count() }).from(courseModules).where(eq(courseModules.courseId, input.courseId));
  const [module] = await db.insert(courseModules).values({ ...input, description: input.description ?? null, position: (rows[0]?.total ?? 0) + 1 }).$returningId();
  return module;
}

export async function updateModuleRecord(input: { moduleId: number; title: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(courseModules).set({ title: input.title, description: input.description ?? null }).where(eq(courseModules.id, input.moduleId));
}

export async function createLessonRecord(input: { moduleId: number; title: string; content: string; estimatedMinutes: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  const rows = await db.select({ total: count() }).from(lessons).where(eq(lessons.moduleId, input.moduleId));
  const [lesson] = await db.insert(lessons).values({ ...input, position: (rows[0]?.total ?? 0) + 1 }).$returningId();
  return lesson;
}

export async function updateLessonRecord(input: { lessonId: number; title: string; content: string; estimatedMinutes: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.update(lessons).set({ title: input.title, content: input.content, estimatedMinutes: input.estimatedMinutes }).where(eq(lessons.id, input.lessonId));
}

export async function enrollLearnerRecord(input: { courseId: number; learnerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database tidak tersedia.");
  await db.insert(enrollments).values(input).onDuplicateKeyUpdate({ set: { status: "active", completedAt: null } });
}

export async function getAssignmentDetail(assignmentId: number) {
  const db = await getDb();
  if (!db) return null;
  const assignment = (await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1))[0];
  if (!assignment) return null;
  const rubric = (await db.select().from(rubrics).where(eq(rubrics.assignmentId, assignmentId)).limit(1))[0] ?? null;
  const criteria = rubric ? await db.select().from(rubricCriteria).where(eq(rubricCriteria.rubricId, rubric.id)).orderBy(rubricCriteria.position) : [];
  return { assignment, rubric, criteria };
}

export async function createInAppNotification(input: {
  userId: number;
  type: "submission_received" | "review_approved" | "submission_returned";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values({ ...input, data: input.data ?? null });
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function listNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(20);
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export const table = {
  aiReviews,
  assignments,
  auditLogs,
  courseModules,
  courses,
  enrollments,
  finalReviews,
  lessonProgress,
  lessons,
  notifications,
  rubricCriteria,
  rubrics,
  submissions,
  users,
};
