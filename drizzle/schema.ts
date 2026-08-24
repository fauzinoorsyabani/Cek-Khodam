import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoles = ["super_admin", "admin", "user"] as const;
export const courseStatuses = ["draft", "published", "archived"] as const;
export const enrollmentStatuses = ["active", "completed", "withdrawn"] as const;
export const submissionStatuses = [
  "draft",
  "submitted",
  "ai_reviewed",
  "needs_human_review",
  "reviewed",
  "returned",
] as const;

export type PerformanceLevel = {
  name: string;
  description: string;
  score: number;
};

export type AiCriterionScore = {
  criterionId: number;
  score: number;
  rationale: string;
  strengths: string[];
  improvements: string[];
};

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", userRoles).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    summary: text("summary").notNull(),
    status: mysqlEnum("status", courseStatuses).default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    publishedAt: timestamp("publishedAt"),
  },
  table => [
    uniqueIndex("courses_slug_unique").on(table.slug),
    index("courses_owner_status_idx").on(table.ownerId, table.status),
  ],
);

export const courseModules = mysqlTable(
  "course_modules",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    position: int("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("course_modules_course_position_unique").on(table.courseId, table.position)],
);

export const lessons = mysqlTable(
  "lessons",
  {
    id: int("id").autoincrement().primaryKey(),
    moduleId: int("moduleId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    content: text("content").notNull(),
    position: int("position").notNull(),
    estimatedMinutes: int("estimatedMinutes").default(10).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("lessons_module_position_unique").on(table.moduleId, table.position)],
);

export const enrollments = mysqlTable(
  "enrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    learnerId: int("learnerId").notNull(),
    status: mysqlEnum("status", enrollmentStatuses).default("active").notNull(),
    enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    uniqueIndex("enrollments_course_learner_unique").on(table.courseId, table.learnerId),
    index("enrollments_learner_status_idx").on(table.learnerId, table.status),
  ],
);

export const lessonProgress = mysqlTable(
  "lesson_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    lessonId: int("lessonId").notNull(),
    learnerId: int("learnerId").notNull(),
    completedAt: timestamp("completedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("lesson_progress_lesson_learner_unique").on(table.lessonId, table.learnerId)],
);

export const assignments = mysqlTable(
  "assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions").notNull(),
    status: mysqlEnum("status", courseStatuses).default("draft").notNull(),
    dueAt: timestamp("dueAt"),
    maxAttempts: int("maxAttempts").default(1).notNull(),
    allowResubmission: boolean("allowResubmission").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("assignments_course_status_idx").on(table.courseId, table.status)],
);

export const rubrics = mysqlTable(
  "rubrics",
  {
    id: int("id").autoincrement().primaryKey(),
    assignmentId: int("assignmentId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions"),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("rubrics_assignment_unique").on(table.assignmentId)],
);

export const rubricCriteria = mysqlTable(
  "rubric_criteria",
  {
    id: int("id").autoincrement().primaryKey(),
    rubricId: int("rubricId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    weight: int("weight").notNull(),
    minScore: int("minScore").default(0).notNull(),
    maxScore: int("maxScore").default(100).notNull(),
    performanceLevels: json("performanceLevels").$type<PerformanceLevel[]>().notNull(),
    position: int("position").notNull(),
  },
  table => [uniqueIndex("rubric_criteria_rubric_position_unique").on(table.rubricId, table.position)],
);

export const submissions = mysqlTable(
  "submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    assignmentId: int("assignmentId").notNull(),
    learnerId: int("learnerId").notNull(),
    content: text("content").notNull(),
    attempt: int("attempt").default(1).notNull(),
    status: mysqlEnum("status", submissionStatuses).default("draft").notNull(),
    submittedAt: timestamp("submittedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("submissions_assignment_learner_attempt_unique").on(
      table.assignmentId,
      table.learnerId,
      table.attempt,
    ),
    index("submissions_assignment_status_idx").on(table.assignmentId, table.status),
  ],
);

export const aiReviews = mysqlTable(
  "ai_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    submissionId: int("submissionId").notNull(),
    createdById: int("createdById").notNull(),
    rubricVersion: int("rubricVersion").notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    overallScore: int("overallScore").notNull(),
    criterionScores: json("criterionScores").$type<AiCriterionScore[]>().notNull(),
    summary: text("summary").notNull(),
    strengths: json("strengths").$type<string[]>().notNull(),
    improvementAreas: json("improvementAreas").$type<string[]>().notNull(),
    nextSteps: json("nextSteps").$type<string[]>().notNull(),
    confidence: mysqlEnum("confidence", ["low", "medium", "high"]).notNull(),
    needsHumanReview: boolean("needsHumanReview").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("ai_reviews_submission_created_idx").on(table.submissionId, table.createdAt)],
);

export const finalReviews = mysqlTable(
  "final_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    submissionId: int("submissionId").notNull(),
    reviewerId: int("reviewerId").notNull(),
    decision: mysqlEnum("decision", ["approved", "returned"]).notNull(),
    finalScore: int("finalScore"),
    feedback: text("feedback").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("final_reviews_submission_unique").on(table.submissionId)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    type: mysqlEnum("type", ["submission_received", "review_approved", "submission_returned"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    data: json("data").$type<Record<string, unknown>>(),
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notifications_user_read_created_idx").on(table.userId, table.isRead, table.createdAt)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_logs_created_action_idx").on(table.createdAt, table.action)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
