import { normalizeBdMobile } from "./bd-phone";

/** An institute's student ID pattern (D15, D16). Shared by the settings form preview and the generator (M6). */
export interface StudentIdPattern {
  prefix: string;
  includeCourseCode: boolean;
  separator: "-" | "/" | "";
  sequenceWidth: number;
}

export const DEFAULT_STUDENT_ID_PATTERN: StudentIdPattern = { prefix: "", includeCourseCode: false, separator: "-", sequenceWidth: 4 };

export const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/;
export const SEPARATORS = ["-", "/", ""] as const;

/** A user-facing problem with the pattern, or null. Mirrors the database CHECKs on student_id_settings. */
export function studentIdPatternProblem(pattern: StudentIdPattern): string | null {
  if (pattern.prefix !== "" && !PREFIX_RE.test(pattern.prefix)) {
    return "The prefix must start with a letter and use only capital letters and digits (at most 10).";
  }
  if (!(SEPARATORS as readonly string[]).includes(pattern.separator)) return "Choose a separator: -, / or none.";
  if (!Number.isInteger(pattern.sequenceWidth) || pattern.sequenceWidth < 3 || pattern.sequenceWidth > 6) {
    return "The number must be 3 to 6 digits long.";
  }
  return null;
}

/**
 * Builds a student ID: PREFIX · COURSE CODE · YEAR · NUMBER, joined by the separator, empty pieces left out.
 * The year is always present because the number restarts each year (D16).
 */
export function formatStudentId(pattern: StudentIdPattern, parts: { courseCode?: string | null; year: number; sequence: number }): string {
  if (pattern.includeCourseCode && !parts.courseCode) throw new Error("This pattern needs a course code (D15).");
  const pieces = [
    pattern.prefix,
    pattern.includeCourseCode ? (parts.courseCode ?? "").toUpperCase() : "",
    String(parts.year),
    String(parts.sequence).padStart(pattern.sequenceWidth, "0"),
  ].filter((p) => p !== "");
  const id = pieces.join(pattern.separator);
  // Sign-in looks a user up by email, mobile number or student ID (D17); an ID must never read as either of the others.
  if (id.includes("@") || normalizeBdMobile(id)) throw new Error(`"${id}" could be mistaken for an email or mobile number.`);
  return id;
}
