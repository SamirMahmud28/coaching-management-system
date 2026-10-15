import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADE_SCALE,
  assignPositions,
  bandFor,
  evaluatePaper,
  evaluateStudent,
  gradeForGpa,
  hundredths,
  validateGradeScale,
  type GradeBand,
  type PaperInput,
} from "./result-engine";

const scale = DEFAULT_GRADE_SCALE;
const graded = { showGrades: true };
const marksOnly = { showGrades: false };

function paper(o: Partial<PaperInput> & { obtained?: number | null }): PaperInput {
  return { paperId: o.name ?? "p", name: "P", optional: false, fullMarks: 100, passMarks: 33, absent: false, obtained: null, parts: [], ...o };
}

describe("bandFor — percentage boundaries in hundredths", () => {
  it.each([
    [100, 100, "A+"], [80, 100, "A+"], [79, 100, "A"], [70, 100, "A"], [69, 100, "A-"], [60, 100, "A-"],
    [59, 100, "B"], [50, 100, "B"], [49, 100, "C"], [40, 100, "C"], [39, 100, "D"], [33, 100, "D"], [32, 100, "F"], [0, 100, "F"],
    [40, 50, "A+"], [39, 50, "A"], [26, 75, "D"], [24, 75, "F"], [60, 75, "A+"],
    // Decimal marks: 79.99 of 100 is an A; 39.75 of 50 = 79.5% is an A; 8.25 of 25 = 33% is a D.
    [79.99, 100, "A"], [39.75, 50, "A"], [8.25, 25, "D"],
  ])("%d of %d → %s", (obtained, full, grade) => {
    expect(bandFor(hundredths(obtained), hundredths(full), scale).grade).toBe(grade);
  });
});

describe("a paper", () => {
  it("passes on the pass mark and fails just below it, with decimals", () => {
    expect(evaluatePaper(paper({ obtained: 33 }), scale, graded)).toMatchObject({ status: "PASSED", grade: "D", gradePoint: 1 });
    expect(evaluatePaper(paper({ obtained: 32.75 }), scale, graded)).toMatchObject({ status: "FAILED", grade: "F", gradePoint: 0 });
  });

  it("fails below a higher pass mark even with a passing percentage", () => {
    expect(evaluatePaper(paper({ obtained: 38, passMarks: 40 }), scale, graded)).toMatchObject({ status: "FAILED", grade: "F" });
  });

  it("with grades shown, an F is a fail even above a lower pass mark; with marks only, the pass mark decides", () => {
    expect(evaluatePaper(paper({ obtained: 25, passMarks: 20 }), scale, graded)).toMatchObject({ status: "FAILED", grade: "F" });
    expect(evaluatePaper(paper({ obtained: 25, passMarks: 20 }), scale, marksOnly)).toMatchObject({ status: "PASSED", grade: null, gradePoint: null });
  });

  it("is Absent when marked absent, pending with no mark, and not taken when an optional paper has no mark", () => {
    expect(evaluatePaper(paper({ absent: true }), scale, graded)).toMatchObject({ status: "ABSENT", obtained: null, grade: "F" });
    expect(evaluatePaper(paper({ obtained: null }), scale, graded)).toMatchObject({ status: "PENDING", grade: null });
    expect(evaluatePaper(paper({ optional: true, obtained: null }), scale, graded)).toMatchObject({ status: "NOT_TAKEN" });
  });

  it("keeps a real zero as a fail, not an absence", () => {
    expect(evaluatePaper(paper({ obtained: 0 }), scale, graded)).toMatchObject({ status: "FAILED", obtained: 0 });
  });

  describe("with parts (written / MCQ)", () => {
    const parts = (written: number | null, mcq: number | null) =>
      paper({
        parts: [
          { name: "Written", fullMarks: 70, passMarks: 23, obtained: written },
          { name: "MCQ", fullMarks: 30, passMarks: 10, obtained: mcq },
        ],
      });

    it("sums the parts and grades the total", () => {
      expect(evaluatePaper(parts(60, 21.5), scale, graded)).toMatchObject({ status: "PASSED", obtained: 81.5, grade: "A+" });
    });

    it("fails the paper when a part is below its own pass mark, however high the total", () => {
      const out = evaluatePaper(parts(70, 9.75), scale, graded);
      expect(out).toMatchObject({ status: "FAILED", obtained: 79.75, grade: "F" });
      expect(out.parts.map((p) => p.passed)).toEqual([true, false]);
    });

    it("ignores the part rule for a part without a pass mark", () => {
      const p = paper({ parts: [{ name: "Written", fullMarks: 70, passMarks: null, obtained: 30 }, { name: "MCQ", fullMarks: 30, passMarks: null, obtained: 5 }] });
      expect(evaluatePaper(p, scale, graded)).toMatchObject({ status: "PASSED", obtained: 35 });
    });

    it("is pending while only some parts are entered", () => {
      expect(evaluatePaper(parts(45, null), scale, graded)).toMatchObject({ status: "PENDING", obtained: null });
    });
  });
});

describe("a student's result", () => {
  it("averages compulsory grade points, rounded to two decimals", () => {
    const out = evaluateStudent([paper({ name: "a", obtained: 85 }), paper({ name: "b", obtained: 72 }), paper({ name: "c", obtained: 55 })], scale, graded);
    expect(out).toMatchObject({ status: "COMPLETE", gpa: 4, grade: "A", passed: true, failedPapers: 0, totalObtained: 212, totalFull: 300 });
    expect(evaluateStudent([paper({ name: "a", obtained: 90 }), paper({ name: "b", obtained: 75 }), paper({ name: "c", obtained: 75 })], scale, graded).gpa).toBe(4.33);
    expect(evaluateStudent([paper({ name: "a", obtained: 90 }), paper({ name: "b", obtained: 90 }), paper({ name: "c", obtained: 75 })], scale, graded).gpa).toBe(4.67);
  });

  it("fails with GPA 0 when any compulsory paper fails or is absent", () => {
    expect(evaluateStudent([paper({ name: "a", obtained: 95 }), paper({ name: "b", obtained: 20 })], scale, graded)).toMatchObject({ gpa: 0, grade: "F", passed: false, failedPapers: 1 });
    expect(evaluateStudent([paper({ name: "a", obtained: 95 }), paper({ name: "b", absent: true })], scale, graded)).toMatchObject({ status: "COMPLETE", passed: false, failedPapers: 1 });
  });

  it("is pending while a compulsory mark is missing, and Absent when absent from every paper sat", () => {
    expect(evaluateStudent([paper({ name: "a", obtained: 95 }), paper({ name: "b", obtained: null })], scale, graded)).toMatchObject({ status: "PENDING", passed: null, gpa: null });
    expect(evaluateStudent([paper({ name: "a", absent: true }), paper({ name: "b", absent: true }), paper({ name: "o", optional: true })], scale, graded)).toMatchObject({ status: "ABSENT", passed: false });
  });

  it("gives marks-only exams pass/fail and totals without grades or GPA", () => {
    expect(evaluateStudent([paper({ name: "a", obtained: 50 }), paper({ name: "b", obtained: 40 })], scale, marksOnly)).toMatchObject({ passed: true, gpa: null, grade: null, totalObtained: 90 });
  });

  describe("optional (4th) subject — BD rule", () => {
    const compulsory = [paper({ name: "a", obtained: 72 }), paper({ name: "b", obtained: 72 })]; // 4 + 4 = 8 / 2 = 4.00

    it("adds only the grade points above 2.0, capped at the top point", () => {
      expect(evaluateStudent([...compulsory, paper({ name: "o", optional: true, obtained: 85 })], scale, graded).gpa).toBe(5); // (8 + 3) / 2 → 5
      expect(evaluateStudent([...compulsory, paper({ name: "o", optional: true, obtained: 55 })], scale, graded).gpa).toBe(4.5); // (8 + 1) / 2
      expect(evaluateStudent([...compulsory, paper({ name: "o", optional: true, obtained: 45 })], scale, graded).gpa).toBe(4); // C adds nothing
    });

    it("never fails the student and isn't divided by", () => {
      const out = evaluateStudent([...compulsory, paper({ name: "o", optional: true, obtained: 10 })], scale, graded);
      expect(out).toMatchObject({ gpa: 4, passed: true, failedPapers: 0 });
      expect(out.papers.find((p) => p.optional)).toMatchObject({ status: "FAILED", grade: "F" });
    });

    it("counts its marks in the total only when taken", () => {
      expect(evaluateStudent([...compulsory, paper({ name: "o", optional: true, obtained: 50 })], scale, graded)).toMatchObject({ totalObtained: 194, totalFull: 300 });
      expect(evaluateStudent([...compulsory, paper({ name: "o", optional: true })], scale, graded)).toMatchObject({ status: "COMPLETE", totalObtained: 144, totalFull: 200, gpa: 4 });
    });

    it("treats optional-only exams as compulsory", () => {
      expect(evaluateStudent([paper({ name: "o", optional: true, obtained: 85 })], scale, graded)).toMatchObject({ gpa: 5, passed: true });
      expect(evaluateStudent([paper({ name: "o", optional: true, obtained: 10 })], scale, graded)).toMatchObject({ gpa: 0, passed: false });
    });
  });
});

describe("gradeForGpa", () => {
  it.each([[5, "A+"], [4.99, "A"], [4, "A"], [3.99, "A-"], [3.5, "A-"], [3.49, "B"], [3, "B"], [2, "C"], [1, "D"], [0.99, "F"], [0, "F"]])("%d → %s", (gpa, grade) => {
    expect(gradeForGpa(gpa, scale).grade).toBe(grade);
  });
});

describe("merit positions", () => {
  const r = (passed: boolean, totalObtained: number, gpa: number | null = null, status: "COMPLETE" | "PENDING" | "ABSENT" = "COMPLETE") => ({ status, passed, totalObtained, gpa });

  it("ranks passed students first, then by total marks, then GPA", () => {
    expect(assignPositions([r(false, 500), r(true, 300, 4), r(true, 320, 3.5), r(true, 300, 4.5)])).toEqual([4, 3, 1, 2]);
  });

  it("gives equal students the same position and skips the next (1, 1, 3)", () => {
    expect(assignPositions([r(true, 400.5), r(true, 400.5), r(true, 390)])).toEqual([1, 1, 3]);
  });

  it("leaves pending and all-absent students unranked", () => {
    expect(assignPositions([r(true, 300), r(false, 0, null, "ABSENT"), r(true, 350), r(true, 0, null, "PENDING")])).toEqual([2, null, 1, null]);
  });

  it("is independent of input order", () => {
    const items = [r(true, 400), r(true, 300), r(true, 410), r(false, 500)];
    expect(assignPositions([...items].reverse())).toEqual([...assignPositions(items)].reverse());
  });
});

describe("validateGradeScale", () => {
  it("accepts the default scale", () => {
    expect(validateGradeScale(DEFAULT_GRADE_SCALE)).toBeNull();
  });

  const withChange = (fn: (bands: GradeBand[]) => void) => {
    const bands = DEFAULT_GRADE_SCALE.map((b) => ({ ...b }));
    fn(bands);
    return validateGradeScale(bands);
  };

  it.each([
    ["no 0% band", (b: GradeBand[]) => { b[6].minPercent = 10; }, "lowest grade must start at 0%"],
    ["failing band worth points", (b: GradeBand[]) => { b[6].gradePoint = 0.5; }, "must have 0 grade points"],
    ["duplicate minimum", (b: GradeBand[]) => { b[1].minPercent = 80; }, "same percentage"],
    ["duplicate name", (b: GradeBand[]) => { b[1].grade = "a+"; }, "only once"],
    ["points out of order", (b: GradeBand[]) => { b[2].gradePoint = 4.5; }, "more grade points"],
    ["minimum above 100", (b: GradeBand[]) => { b[0].minPercent = 101; }, "0 to 100"],
    ["three decimals", (b: GradeBand[]) => { b[2].gradePoint = 3.555; }, "two decimals"],
    ["empty name", (b: GradeBand[]) => { b[0].grade = " "; }, "1–5 characters"],
    ["a second zero-point band", (b: GradeBand[]) => { b[5].gradePoint = 0; }, "Only the lowest grade"],
  ])("rejects %s", (_label, change, message) => {
    expect(withChange(change)).toContain(message);
  });
});
