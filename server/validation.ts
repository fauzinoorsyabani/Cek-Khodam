import { z } from "zod";

export const performanceLevelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  score: z.number().int().min(0).max(100),
});

export const rubricCriterionInputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(5).max(2000),
  weight: z.number().int().min(1).max(100),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(1).max(100),
  performanceLevels: z.array(performanceLevelSchema).min(2).max(6),
}).superRefine((criterion, ctx) => {
  if (criterion.maxScore <= criterion.minScore) {
    ctx.addIssue({ code: "custom", message: "Nilai maksimum harus lebih besar dari nilai minimum.", path: ["maxScore"] });
  }
});

export const rubricInputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  instructions: z.string().trim().max(2000).optional(),
  criteria: z.array(rubricCriterionInputSchema).min(1).max(12),
}).superRefine((rubric, ctx) => {
  const weightTotal = rubric.criteria.reduce((total, criterion) => total + criterion.weight, 0);
  if (weightTotal !== 100) {
    ctx.addIssue({ code: "custom", message: "Total bobot kriteria harus tepat 100%.", path: ["criteria"] });
  }
});

export const aiReviewResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  criterionScores: z.array(z.object({
    criterionId: z.number().int().positive(),
    score: z.number().int().min(0).max(100),
    rationale: z.string().min(1).max(1600),
    strengths: z.array(z.string().min(1).max(280)).max(4),
    improvements: z.array(z.string().min(1).max(280)).max(4),
  })).min(1).max(12),
  summary: z.string().min(1).max(1800),
  strengths: z.array(z.string().min(1).max(280)).max(5),
  improvementAreas: z.array(z.string().min(1).max(280)).max(5),
  nextSteps: z.array(z.string().min(1).max(280)).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  needsHumanReview: z.boolean(),
});

export type AiReviewResult = z.infer<typeof aiReviewResultSchema>;
