/**
 * Result calculation (EXAM-AND-RESULT-LOGIC.md, D102–D109). Ported from the EMS (`exam/result-engine.ts`) and adapted:
 * marks may have two decimals (D104), Absent is recorded rather than inferred (D106), a mark not entered yet leaves the
 * result pending, and the merit order is total marks first (D103). Pure functions only, table-tested. Marks are
 * compared in hundredths (integers), so a boundary like 79.99% never becomes an A+.
 */

export interface GradeBand {
  grade: string;
  minPercent: number;
  gradePoint: number;
}

/** Bangladesh GPA 5.0 scale (D102); used until an institute saves its own. */
export const DEFAULT_GRADE_SCALE: readonly GradeBand[] = [
  { grade: "A+", minPercent: 80, gradePoint: 5 },
  { grade: "A", minPercent: 70, gradePoint: 4 },
  { grade: "A-", minPercent: 60, gradePoint: 3.5 },
  { grade: "B", minPercent: 50, gradePoint: 3 },
  { grade: "C", minPercent: 40, gradePoint: 2 },
  { grade: "D", minPercent: 33, gradePoint: 1 },
  { grade: "F", minPercent: 0, gradePoint: 0 },
];

/** Only the part of an optional (4th) subject's grade point above this is added to the GPA (D108). */
export const OPTIONAL_BONUS_THRESHOLD = 2;

/** Marks and grade points in hundredths, as integers. */
export const hundredths = (n: number) => Math.round(n * 100);
const fromHundredths = (n: number) => n / 100;

/** Highest band first. Assumes a valid scale (see `validateGradeScale`). */
export function sortScale(scale: readonly GradeBand[]): GradeBand[] {
  return [...scale].sort((a, b) => b.minPercent - a.minPercent);
}

/** Returns a problem description, or null when the scale is usable. */
export function validateGradeScale(scale: readonly GradeBand[]): string | null {
  if (scale.length < 2) return "A grading scale needs at least two grades.";
  if (scale.length > 15) return "A grading scale can have at most 15 grades.";
  for (const band of scale) {
    if (typeof band.grade !== "string" || !band.grade.trim() || band.grade.trim().length > 5) return "Each grade needs a name of 1–5 characters.";
    if (!Number.isInteger(band.minPercent) || band.minPercent < 0 || band.minPercent > 100) return `The minimum for ${band.grade} must be a whole number from 0 to 100.`;
    const hasAtMostTwoDecimals = Math.abs(band.gradePoint * 100 - hundredths(band.gradePoint)) < 1e-6;
    if (!Number.isFinite(band.gradePoint) || band.gradePoint < 0 || band.gradePoint > 10 || !hasAtMostTwoDecimals) {
      return `The grade point for ${band.grade} must be between 0 and 10, with at most two decimals.`;
    }
  }
  const names = new Set(scale.map((b) => b.grade.trim().toLowerCase()));
  if (names.size !== scale.length) return "Each grade name can appear only once.";
  const mins = new Set(scale.map((b) => b.minPercent));
  if (mins.size !== scale.length) return "Two grades can't start at the same percentage.";
  const sorted = sortScale(scale);
  if (sorted[sorted.length - 1].minPercent !== 0) return "The lowest grade must start at 0%, so every mark gets a grade.";
  if (sorted[sorted.length - 1].gradePoint !== 0) return "The lowest grade is the failing grade and must have 0 grade points.";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].gradePoint > sorted[i - 1].gradePoint) return `${sorted[i].grade} can't be worth more grade points than ${sorted[i - 1].grade}.`;
    if (i < sorted.length - 1 && sorted[i].gradePoint === 0) return "Only the lowest grade can have 0 grade points.";
  }
  return null;
}

/** The band a mark earns: the highest band whose minimum it reaches (obtained / full ≥ min%). Marks in hundredths. */
export function bandFor(obtainedH: number, fullH: number, scale: readonly GradeBand[]): GradeBand {
  const sorted = sortScale(scale);
  return sorted.find((b) => obtainedH * 100 >= b.minPercent * fullH) ?? sorted[sorted.length - 1];
}

export function failingBand(scale: readonly GradeBand[]): GradeBand {
  const sorted = sortScale(scale);
  return sorted[sorted.length - 1];
}

/** The letter for an overall GPA: the highest band whose grade point it reaches. */
export function gradeForGpa(gpa: number, scale: readonly GradeBand[]): GradeBand {
  const byPoint = [...scale].sort((a, b) => b.gradePoint - a.gradePoint || b.minPercent - a.minPercent);
  return byPoint.find((b) => hundredths(gpa) >= hundredths(b.gradePoint)) ?? failingBand(scale);
}

export interface PartInput {
  name: string;
  fullMarks: number;
  /** A part's own pass mark (D105), if it has one. */
  passMarks: number | null;
  obtained: number | null;
}

export interface PaperInput {
  paperId: string;
  name: string;
  optional: boolean;
  fullMarks: number;
  passMarks: number;
  absent: boolean;
  /** For a paper without parts; null when not entered yet. */
  obtained: number | null;
  /** Non-empty when the paper is split into parts; `obtained` is then ignored. */
  parts: PartInput[];
}

/** PENDING: no mark entered yet (or only some parts). An optional paper with nothing entered wasn't taken. */
export type PaperStatus = "PASSED" | "FAILED" | "ABSENT" | "PENDING" | "NOT_TAKEN";

export interface PaperOutcome {
  paperId: string;
  name: string;
  optional: boolean;
  fullMarks: number;
  passMarks: number;
  status: PaperStatus;
  obtained: number | null;
  /** Null when grades aren't shown or there is no result yet. */
  grade: string | null;
  gradePoint: number | null;
  parts: (PartInput & { passed: boolean | null })[];
}

export interface Options {
  /** Grades and GPA on results, or marks only (D102). */
  showGrades: boolean;
}

/**
 * A paper passes when its total reaches its pass mark and every part with a pass mark reaches it (D105). When grades
 * are shown, a percentage in the failing band (F) is a fail too, as on board results. Absent fails it (D106).
 */
export function evaluatePaper(paper: PaperInput, scale: readonly GradeBand[], options: Options): PaperOutcome {
  const base = { paperId: paper.paperId, name: paper.name, optional: paper.optional, fullMarks: paper.fullMarks, passMarks: paper.passMarks };
  const fail = failingBand(scale);
  const partsView = paper.parts.map((p) => ({ ...p, passed: null as boolean | null }));
  if (paper.absent) {
    return { ...base, status: "ABSENT", obtained: null, grade: options.showGrades ? fail.grade : null, gradePoint: options.showGrades ? fail.gradePoint : null, parts: partsView };
  }

  let obtainedH: number | null;
  let partsPassed = true;
  let parts = partsView;
  if (paper.parts.length > 0) {
    const entered = paper.parts.filter((p) => p.obtained !== null);
    if (entered.length === 0) obtainedH = null;
    else if (entered.length < paper.parts.length) return { ...base, status: "PENDING", obtained: null, grade: null, gradePoint: null, parts: partsView };
    else {
      parts = paper.parts.map((p) => ({ ...p, passed: p.passMarks === null ? null : hundredths(p.obtained!) >= hundredths(p.passMarks) }));
      partsPassed = parts.every((p) => p.passed !== false);
      obtainedH = paper.parts.reduce((sum, p) => sum + hundredths(p.obtained!), 0);
    }
  } else {
    obtainedH = paper.obtained === null ? null : hundredths(paper.obtained);
  }
  if (obtainedH === null) return { ...base, status: paper.optional ? "NOT_TAKEN" : "PENDING", obtained: null, grade: null, gradePoint: null, parts };

  const band = bandFor(obtainedH, hundredths(paper.fullMarks), scale);
  const passed = partsPassed && obtainedH >= hundredths(paper.passMarks) && (!options.showGrades || band.gradePoint > fail.gradePoint);
  const awarded = passed ? band : fail;
  return {
    ...base,
    status: passed ? "PASSED" : "FAILED",
    obtained: fromHundredths(obtainedH),
    grade: options.showGrades ? awarded.grade : null,
    gradePoint: options.showGrades ? awarded.gradePoint : null,
    parts,
  };
}

/** COMPLETE: a result. PENDING: a compulsory mark not entered yet. ABSENT: absent from every paper sat (D106). */
export type ResultStatus = "COMPLETE" | "PENDING" | "ABSENT";

export interface StudentOutcome {
  papers: PaperOutcome[];
  status: ResultStatus;
  /** Includes an optional paper that was taken. */
  totalObtained: number;
  totalFull: number;
  passed: boolean | null;
  failedPapers: number;
  gpa: number | null;
  grade: string | null;
}

/**
 * The student's result (D105, D106, D108). Failing any compulsory paper fails the student (GPA 0). Otherwise
 * GPA = (Σ compulsory grade points + the best optional paper's points above 2.0) ÷ number of compulsory papers,
 * rounded to two decimals and capped at the top grade point; an optional paper never fails the student. If an exam
 * has only optional papers, they count as compulsory.
 */
export function evaluateStudent(papers: readonly PaperInput[], scale: readonly GradeBand[], options: Options): StudentOutcome {
  const hasCompulsory = papers.some((p) => !p.optional);
  const asSat = hasCompulsory ? papers : papers.map((p) => ({ ...p, optional: false }));
  const outcomes = asSat.map((p) => evaluatePaper(p, scale, options));
  const core = outcomes.filter((o) => !o.optional);
  const extras = outcomes.filter((o) => o.optional && (o.status === "PASSED" || o.status === "FAILED"));
  const taken = outcomes.filter((o) => o.status !== "NOT_TAKEN");
  const totalObtainedH = taken.reduce((sum, o) => sum + (o.obtained === null ? 0 : hundredths(o.obtained)), 0);
  const totalFullH = taken.reduce((sum, o) => sum + hundredths(o.fullMarks), 0);
  const totals = { totalObtained: fromHundredths(totalObtainedH), totalFull: fromHundredths(totalFullH) };
  const fail = failingBand(scale);

  if (outcomes.some((o) => o.status === "PENDING")) {
    return { papers: outcomes, status: "PENDING", ...totals, passed: null, failedPapers: 0, gpa: null, grade: null };
  }
  const sat = outcomes.filter((o) => o.status !== "NOT_TAKEN");
  if (sat.length === 0 || sat.every((o) => o.status === "ABSENT")) {
    return { papers: outcomes, status: "ABSENT", ...totals, passed: false, failedPapers: core.length, gpa: options.showGrades ? 0 : null, grade: options.showGrades ? fail.grade : null };
  }

  const failedPapers = core.filter((o) => o.status !== "PASSED").length;
  if (failedPapers > 0) {
    return { papers: outcomes, status: "COMPLETE", ...totals, passed: false, failedPapers, gpa: options.showGrades ? 0 : null, grade: options.showGrades ? fail.grade : null };
  }
  if (!options.showGrades) return { papers: outcomes, status: "COMPLETE", ...totals, passed: true, failedPapers: 0, gpa: null, grade: null };

  const coreH = core.reduce((sum, o) => sum + hundredths(o.gradePoint!), 0);
  const bonusH = extras.reduce((best, o) => Math.max(best, hundredths(o.gradePoint!) - hundredths(OPTIONAL_BONUS_THRESHOLD)), 0);
  const topH = Math.max(...scale.map((b) => hundredths(b.gradePoint)));
  const gpa = fromHundredths(Math.min(topH, Math.round((coreH + bonusH) / core.length)));
  return { papers: outcomes, status: "COMPLETE", ...totals, passed: true, failedPapers: 0, gpa, grade: gradeForGpa(gpa, scale).grade };
}

export interface Rankable {
  status: ResultStatus;
  passed: boolean | null;
  totalObtained: number;
  gpa: number | null;
}

/** Merit order (D103): passed before failed, then higher total marks, then higher GPA (when grades are shown). */
export function compareForRank(a: Rankable, b: Rankable): number {
  if (!!a.passed !== !!b.passed) return a.passed ? -1 : 1;
  const total = hundredths(b.totalObtained) - hundredths(a.totalObtained);
  if (total !== 0) return total;
  return hundredths(b.gpa ?? 0) - hundredths(a.gpa ?? 0);
}

/**
 * Competition ranking ("1, 1, 3", D103) across everyone given — the whole exam (D109). Only complete results are
 * ranked: pending and all-absent students get null (D106). Returns positions by input index.
 */
export function assignPositions(items: readonly Rankable[]): (number | null)[] {
  const ranked = items.map((item, index) => ({ item, index })).filter((x) => x.item.status === "COMPLETE");
  ranked.sort((x, y) => compareForRank(x.item, y.item) || x.index - y.index);
  const positions = new Array<number | null>(items.length).fill(null);
  ranked.forEach((entry, i) => {
    const prev = ranked[i - 1];
    positions[entry.index] = prev && compareForRank(prev.item, entry.item) === 0 ? positions[prev.index] : i + 1;
  });
  return positions;
}
