import { describe, expect, it } from "vitest";
import { DEFAULT_STUDENT_ID_PATTERN, formatStudentId, studentIdPatternProblem, type StudentIdPattern } from "./student-id";

const pattern = (p: Partial<StudentIdPattern>): StudentIdPattern => ({ ...DEFAULT_STUDENT_ID_PATTERN, ...p });

describe("formatStudentId", () => {
  it("joins prefix, course code, admission year and a padded number", () => {
    expect(formatStudentId(pattern({ prefix: "KC", includeCourseCode: true }), { courseCode: "hsc", year: 2026, sequence: 1 })).toBe("KC-HSC-2026-0001");
  });

  it("leaves out the pieces the institute doesn't use", () => {
    expect(formatStudentId(pattern({}), { year: 2026, sequence: 42 })).toBe("2026-0042");
    expect(formatStudentId(pattern({ prefix: "UDB", separator: "" , sequenceWidth: 3 }), { year: 2026, sequence: 7 })).toBe("UDB2026007");
    expect(formatStudentId(pattern({ prefix: "KC", separator: "/" }), { year: 2027, sequence: 12 })).toBe("KC/2027/0012");
  });

  it("ignores a course code when the pattern doesn't include one, and requires one when it does", () => {
    expect(formatStudentId(pattern({ prefix: "KC" }), { courseCode: "HSC", year: 2026, sequence: 1 })).toBe("KC-2026-0001");
    expect(() => formatStudentId(pattern({ includeCourseCode: true }), { year: 2026, sequence: 1 })).toThrow(/course code/);
  });
});

describe("studentIdPatternProblem", () => {
  it("accepts the defaults and a typical pattern", () => {
    expect(studentIdPatternProblem(DEFAULT_STUDENT_ID_PATTERN)).toBeNull();
    expect(studentIdPatternProblem(pattern({ prefix: "KC2", includeCourseCode: true, separator: "/", sequenceWidth: 5 }))).toBeNull();
  });

  it("refuses a prefix that doesn't start with a capital letter or is too long", () => {
    for (const prefix of ["kc", "1KC", "K C", "K-C", "ABCDEFGHIJK"]) {
      expect(studentIdPatternProblem(pattern({ prefix })), prefix).toMatch(/prefix/);
    }
  });

  it("refuses an unknown separator and a number width outside 3–6", () => {
    expect(studentIdPatternProblem(pattern({ separator: "." as never }))).toMatch(/separator/);
    for (const sequenceWidth of [2, 7, 3.5]) expect(studentIdPatternProblem(pattern({ sequenceWidth }))).toMatch(/digits/);
  });
});
