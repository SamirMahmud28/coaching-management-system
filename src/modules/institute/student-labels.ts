import type { Gender, GuardianRelation } from "./api";

// Plain (non-client) module so server components such as the student portal can use the labels too.
export const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
export const RELATION_LABEL: Record<GuardianRelation, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  BROTHER: "Brother",
  SISTER: "Sister",
  UNCLE: "Uncle",
  AUNT: "Aunt",
  GRANDPARENT: "Grandparent",
  OTHER: "Other",
};
