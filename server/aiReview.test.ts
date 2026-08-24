import { describe, expect, it } from "vitest";
import { validateAiReview } from "./aiReview";

const criteria = [
  { id: 1, title: "Analisis", description: "Ketepatan analisis", weight: 60, minScore: 0, maxScore: 100, performanceLevels: [] },
  { id: 2, title: "Kejelasan", description: "Kejelasan tulisan", weight: 40, minScore: 0, maxScore: 100, performanceLevels: [] },
];

describe("validateAiReview", () => {
  it("menormalkan skor akhir berdasarkan bobot dan menandai confidence rendah", () => {
    const review = validateAiReview({
      overallScore: 1,
      criterionScores: [
        { criterionId: 1, score: 80, rationale: "Analisis relevan.", strengths: ["Terstruktur"], improvements: ["Perdalam bukti"] },
        { criterionId: 2, score: 50, rationale: "Ide dapat dibaca.", strengths: ["Ringkas"], improvements: ["Perjelas paragraf"] },
      ],
      summary: "Review pendamping.",
      strengths: ["Terstruktur"],
      improvementAreas: ["Bukti"],
      nextSteps: ["Tambahkan referensi"],
      confidence: "low",
      needsHumanReview: false,
    }, criteria);

    expect(review.overallScore).toBe(68);
    expect(review.needsHumanReview).toBe(true);
  });

  it("menolak output yang tidak menilai seluruh kriteria rubrik", () => {
    expect(() => validateAiReview({
      overallScore: 80,
      criterionScores: [{ criterionId: 1, score: 80, rationale: "Baik", strengths: [], improvements: [] }],
      summary: "Review pendamping.",
      strengths: [], improvementAreas: [], nextSteps: [], confidence: "high", needsHumanReview: false,
    }, criteria)).toThrow("seluruh kriteria");
  });
});

