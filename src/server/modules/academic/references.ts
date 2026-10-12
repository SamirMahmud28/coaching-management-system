import { createReferenceRegistry } from "../../core/references";

/**
 * Delete guard for academic records. Other modules (students' batch memberships in M6, attendance and exams later)
 * register a counter for their own tables, so a course, batch or subject in use can't be deleted (archive it instead).
 */
export const academicReferences = createReferenceRegistry<"COURSE" | "SUBJECT" | "BATCH" | "BATCH_SUBJECT">();
