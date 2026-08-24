export const AUDIT_ACTION = {
  roleChanged: "user.role_changed",
  courseCreated: "course.created",
  courseUpdated: "course.updated",
  courseStatusChanged: "course.status_changed",
  rubricUpdated: "rubric.updated",
  aiReviewCreated: "ai_review.created",
  gradeApproved: "grade.approved",
  submissionReturned: "submission.returned",
} as const;

export const REQUIRED_AUDIT_ACTIONS = [
  AUDIT_ACTION.roleChanged,
  AUDIT_ACTION.courseCreated,
  AUDIT_ACTION.courseUpdated,
  AUDIT_ACTION.rubricUpdated,
  AUDIT_ACTION.aiReviewCreated,
  AUDIT_ACTION.gradeApproved,
] as const;
