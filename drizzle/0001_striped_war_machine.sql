CREATE TABLE `ai_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`createdById` int NOT NULL,
	`rubricVersion` int NOT NULL,
	`model` varchar(120) NOT NULL,
	`overallScore` int NOT NULL,
	`criterionScores` json NOT NULL,
	`summary` text NOT NULL,
	`strengths` json NOT NULL,
	`improvementAreas` json NOT NULL,
	`nextSteps` json NOT NULL,
	`confidence` enum('low','medium','high') NOT NULL,
	`needsHumanReview` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`instructions` text NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`dueAt` timestamp,
	`maxAttempts` int NOT NULL DEFAULT 1,
	`allowResubmission` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_modules_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_modules_course_position_unique` UNIQUE(`courseId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`summary` text NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`publishedAt` timestamp,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`learnerId` int NOT NULL,
	`status` enum('active','completed','withdrawn') NOT NULL DEFAULT 'active',
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrollments_course_learner_unique` UNIQUE(`courseId`,`learnerId`)
);
--> statement-breakpoint
CREATE TABLE `final_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`decision` enum('approved','returned') NOT NULL,
	`finalScore` int,
	`feedback` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `final_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `final_reviews_submission_unique` UNIQUE(`submissionId`)
);
--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lessonId` int NOT NULL,
	`learnerId` int NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lesson_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `lesson_progress_lesson_learner_unique` UNIQUE(`lessonId`,`learnerId`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`content` text NOT NULL,
	`position` int NOT NULL,
	`estimatedMinutes` int NOT NULL DEFAULT 10,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`),
	CONSTRAINT `lessons_module_position_unique` UNIQUE(`moduleId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('submission_received','review_approved','submission_returned') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`data` json,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rubric_criteria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rubricId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`weight` int NOT NULL,
	`minScore` int NOT NULL DEFAULT 0,
	`maxScore` int NOT NULL DEFAULT 100,
	`performanceLevels` json NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `rubric_criteria_id` PRIMARY KEY(`id`),
	CONSTRAINT `rubric_criteria_rubric_position_unique` UNIQUE(`rubricId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `rubrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`instructions` text,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rubrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `rubrics_assignment_unique` UNIQUE(`assignmentId`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`learnerId` int NOT NULL,
	`content` text NOT NULL,
	`attempt` int NOT NULL DEFAULT 1,
	`status` enum('draft','submitted','ai_reviewed','needs_human_review','reviewed','returned') NOT NULL DEFAULT 'draft',
	`submittedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `submissions_assignment_learner_attempt_unique` UNIQUE(`assignmentId`,`learnerId`,`attempt`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','admin','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `ai_reviews_submission_created_idx` ON `ai_reviews` (`submissionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `assignments_course_status_idx` ON `assignments` (`courseId`,`status`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_action_idx` ON `audit_logs` (`createdAt`,`action`);--> statement-breakpoint
CREATE INDEX `courses_owner_status_idx` ON `courses` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `enrollments_learner_status_idx` ON `enrollments` (`learnerId`,`status`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_created_idx` ON `notifications` (`userId`,`isRead`,`createdAt`);--> statement-breakpoint
CREATE INDEX `submissions_assignment_status_idx` ON `submissions` (`assignmentId`,`status`);