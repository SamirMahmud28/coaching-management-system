import type { PermissionName } from "@/server/core/rbac/catalog";

/**
 * In-app help (D96): one guide per feature, shown in each page's "How this works" panel and in the Help centre. Written
 * for institute staff in plain words — what the feature is for, the steps, the rules the system enforces, and common
 * questions. When a feature's behaviour changes, its guide changes in the same commit (CLAUDE.md, D97).
 */
export interface HelpTopic {
  key: HelpTopicKey;
  title: string;
  /** Shown as the Help centre's section. */
  area: "Getting started" | "Teaching" | "Students" | "Staff and access" | "Institute" | "Fees" | "Attendance";
  /** The topic appears in the Help centre only for users holding this (permissions are already limited to active modules). */
  permission: PermissionName | null;
  summary: string;
  steps: string[];
  rules: string[];
  faqs: { q: string; a: string }[];
}

export type HelpTopicKey =
  | "getting-started"
  | "courses"
  | "batches"
  | "instructors"
  | "admission"
  | "student-records"
  | "users"
  | "settings"
  | "modules"
  | "audit-log"
  | "fees-setup"
  | "fees-generate"
  | "fees-student"
  | "fees-reports"
  | "attendance-registers";

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    key: "getting-started",
    title: "Getting started",
    area: "Getting started",
    permission: null,
    summary: "Set your institute up in this order; each step uses what the one before it created.",
    steps: [
      "Settings: add your institute's name, logo, contact details and signatories, and choose how student IDs look.",
      "Courses & batches: create each course with its subjects, then its batches; give each batch its subjects, instructors and weekly class times.",
      "Instructors: add your teachers first if you want to assign them to batches straight away.",
      "Students: admit students into their batches. Each gets a student ID and a temporary password to sign in.",
      "Users: add office staff (for example an Accountant) with the roles they need.",
      "Paid modules such as Fees appear once your plan includes them (see Modules).",
    ],
    rules: [
      "Nothing you set up is lost: records in use are archived rather than deleted, and switching a module off only hides its data.",
      "Everyone signs in at your institute's own address; each person sees only what their role allows.",
    ],
    faqs: [
      { q: "Can I change things later?", a: "Yes. Names, amounts and schedules can be edited at any time. A few things are fixed once used — for example a student's ID — and the screen says so." },
      { q: "Where do I see what changed and who changed it?", a: "In the Audit log, if your role includes it." },
    ],
  },
  {
    key: "courses",
    title: "Courses and subjects",
    area: "Teaching",
    permission: "academic.view",
    summary: "A course (for example HSC 2026 Science) groups the subjects it teaches and the batches that study it.",
    steps: [
      "Click New course and give it a name and a short code (capital letters and digits, like HSC26). The code can appear in student IDs.",
      "Set the monthly fee due day if you use the Fees module (for example day 10).",
      "Open the course and add its subjects (Physics, Chemistry …).",
      "Add batches to the course, then set each batch up on its own page.",
    ],
    rules: [
      "Names are unique: no two courses share a name or code, and a course can't have two subjects or batches with the same name (capital letters don't matter).",
      "A course, subject or batch that is in use can't be deleted — archive it instead. Archived items are hidden from new work and can be restored.",
      "An archived course takes no new subjects or batches until you restore it.",
      "A course's code can't change once a student ID has been issued with it.",
    ],
    faqs: [
      { q: "Why can't I delete a course?", a: "Because something uses it — subjects, batches, students or fees. The message lists what. Archive it to hide it while keeping its history." },
      { q: "Do I need the due day?", a: "Only for the Fees module: a month's charge falls due on that day of the month." },
    ],
  },
  {
    key: "batches",
    title: "Batches, instructors and class times",
    area: "Teaching",
    permission: "academic.view",
    summary: "A batch is a group of students in one course. For each of its subjects you choose who teaches it and when it meets each week.",
    steps: [
      "On the batch page, pick the subjects this batch takes (only the course's own subjects are offered).",
      "For each subject, use the ⋯ menu → Choose instructors.",
      "Add class times: day, start and end (24-hour time, for example 16:30).",
      "Students are added to batches when they are admitted or from their profile; the batch page lists its current students.",
    ],
    rules: [
      "An instructor can't be in two classes at once: a class time that overlaps another class the same instructor teaches is refused, and the message names the clash. Back-to-back classes are fine; archived batches don't count.",
      "Only active instructors can be newly assigned. Someone deactivated later stays listed (marked inactive) until you remove them.",
      "Removing a subject from a batch removes its instructors and class times too. A subject that already has attendance records can't be removed, so its history is kept.",
      "Restoring an archived batch is refused if its class times now clash.",
    ],
    faqs: [
      { q: "Why was my class time refused?", a: "One of the subject's instructors already teaches at an overlapping time on that day. Change the time, or change who teaches one of the classes." },
      { q: "Can the same subject meet twice a week?", a: "Yes — add a class time for each day." },
    ],
  },
  {
    key: "instructors",
    title: "Instructors",
    area: "Staff and access",
    permission: "instructors.view",
    summary: "Your teachers. Each instructor has a sign-in and sees only the batches they teach.",
    steps: [
      "Click New instructor: name, mobile number or email (they sign in with either), and a temporary password (Generate makes one).",
      "Copy the password from the dialog and give it to them privately; it is shown only once.",
      "They sign in, choose their own password, and land in the instructor portal.",
      "Assign them to batch subjects from each batch's page.",
    ],
    rules: [
      "Instructors see their own batches and those students' names, IDs, photos and school — never mobile numbers, guardian details or fees.",
      "Deactivating signs them out everywhere and blocks sign-in; nothing is deleted. Reactivate any time.",
      "Reset password gives them a new temporary password and signs them out.",
    ],
    faqs: [
      { q: "An instructor forgot their password.", a: "Open their profile → Actions → Reset password, and give them the new temporary password." },
      { q: "Can two instructors share a mobile number?", a: "No — a mobile number or email signs in exactly one person." },
    ],
  },
  {
    key: "admission",
    title: "Admitting a student",
    area: "Students",
    permission: "students.create",
    summary: "Admission creates the student's record, their student ID and their sign-in in one step.",
    steps: [
      "Fill in the student's name and gender and the guardian's name, relation and mobile number — these are required. Everything else can be added later.",
      "Choose the admission date (its year goes into the ID) and the course. The course is required when your ID pattern includes the course code.",
      "Tick the batches the student joins now (optional — you can add batches later, from any course).",
      "Leave 'Type the student ID myself' off to get the next ID from your pattern, or type one (it must be unused).",
      "Generate a temporary password, click Admit student, and give the ID and password to the student; they are shown only once.",
    ],
    rules: [
      "Student IDs come from the pattern in Settings, for example KC-HSC26-2026-0001. The number restarts each year (per course if the pattern uses the course code) and is never reused.",
      "An ID never changes once issued — not even if you change the pattern later.",
      "Students sign in with their student ID and must change the temporary password the first time.",
    ],
    faqs: [
      { q: "Can a student be in two courses?", a: "Yes. Add them to batches of both courses; their ID keeps the code of the admission course." },
      { q: "I typed the wrong admission date.", a: "The admission date and course are fixed once the ID is issued, because the ID is built from them. Note the correct date in the staff note if needed." },
    ],
  },
  {
    key: "student-records",
    title: "Student records, status and batches",
    area: "Students",
    permission: "students.view",
    summary: "Each student's profile shows their details, batches and status history. Status controls whether they can sign in.",
    steps: [
      "Find a student with the search box (name, ID, or mobile number if you may see contacts) and the filters.",
      "Edit details from Actions → Edit details.",
      "Change status from Actions → Change status: On hold, Completed, Left, or back to Active.",
      "Add the student to a batch with Add to batch; use a batch's ⋯ menu to set a roll number or end the membership.",
    ],
    rules: [
      "Only Active students can sign in. On hold, Completed and Left sign the student out and block sign-in.",
      "Left needs a reason, and so does bringing a Completed or Left student back.",
      "Completed and Left close all the student's current batches with the same status. On hold doesn't change batches, but On hold students get no new fees and are left off attendance registers.",
      "Closed batch memberships stay closed; to rejoin, add the batch again. A Completed or Left student is reactivated first.",
      "Roll numbers are optional and unique among a batch's current students.",
      "Mobile numbers and the address are shown only to staff whose role includes contact details.",
    ],
    faqs: [
      { q: "A student is taking a break.", a: "Set them On hold. They keep their batches; set them back to Active when they return." },
      { q: "Are a student's records deleted when they leave?", a: "Never. Their history, attendance and fees stay; dues they still owe remain payable." },
    ],
  },
  {
    key: "users",
    title: "Users and roles",
    area: "Staff and access",
    permission: "users.view",
    summary: "Office staff who sign in, and the roles that decide what each can see and do.",
    steps: [
      "Click New user: name, email or mobile, the roles they get, and a temporary password.",
      "Give them the password privately; they change it at first sign-in.",
      "Change someone's roles, disable them, or reset their password from the ⋯ menu.",
    ],
    rules: [
      "Owner and Admin can do everything. Accountant handles fees and can look up students and courses. Instructor and Student roles are given automatically to instructor and student sign-ins.",
      "You can only give roles whose permissions you hold yourself.",
      "The Owner can't be disabled, and only the Owner changes the Owner's password. Ownership can only be moved to someone else by your provider.",
      "You can't disable your own account.",
      "Disabling signs the person out everywhere; nothing is deleted.",
    ],
    faqs: [{ q: "Where are instructors and students?", a: "Their sign-ins are made from the Instructors and Students pages, not here." }],
  },
  {
    key: "settings",
    title: "Institute settings",
    area: "Institute",
    permission: "settings.manage",
    summary: "Your institute's name, logo, colours and contacts (used on receipts, reports and your public page), signatories, and the student ID pattern.",
    steps: [
      "Profile & branding: name, short name, address, phone, email, website, logo and colours.",
      "Signatories: the people who sign documents (for example Director), with an optional signature image. The first one signs receipts.",
      "Student ID: choose the prefix, whether to include the course code, the separator and how many digits; the example shows what new IDs will look like.",
    ],
    rules: [
      "A new ID pattern applies to students admitted from now on; existing IDs never change.",
      "Your public page and printed documents use these details straight away.",
    ],
    faqs: [{ q: "Why must the ID include the year?", a: "Because the running number restarts every year; the year keeps IDs unique." }],
  },
  {
    key: "modules",
    title: "Modules",
    area: "Institute",
    permission: "modules.view",
    summary: "Paid modules (Fees, Attendance, Exams, Routine, Website) add features on top of the core system.",
    steps: ["See which modules are on for your institute.", "Request a module you'd like; the provider switches it on."],
    rules: [
      "Switching a module off hides its pages and data; nothing is deleted, and switching it back on restores everything.",
      "Module features appear in the menu only for staff whose role includes them.",
    ],
    faqs: [],
  },
  {
    key: "audit-log",
    title: "Audit log",
    area: "Institute",
    permission: "audit.view",
    summary: "A record of important actions — who did what, when, and what changed.",
    steps: ["Browse the latest entries page by page; expand an entry to see what changed (old and new values)."],
    rules: ["Entries can't be edited or deleted. Passwords are never recorded."],
    faqs: [],
  },
  {
    key: "fees-setup",
    title: "Fee setup",
    area: "Fees",
    permission: "fees.view",
    summary: "Each course's fees — admission, monthly and other one-time fees — and your receipt numbering.",
    steps: [
      "For each course, click Add fee: choose the kind (Admission, Monthly or Other one-time), a name and the amount.",
      "Set the course's monthly due day on the course itself (Courses & batches) — monthly charges fall due on that day.",
      "Give a student a different amount (for example a sibling rate) on their profile → Fee amounts → Set own amount, with a reason.",
      "Choose your receipt prefix in the Receipts card (for example SHK makes receipts SHK-000001, SHK-000002 …).",
    ],
    rules: [
      "A student pays a course's fees once, however many of its batches they attend; two courses mean both courses' fees.",
      "Changing an amount affects charges generated from now on; existing charges keep their amount.",
      "A student's own amount of ৳0 means they aren't charged that fee.",
      "A fee that has been charged can't be deleted — archive it instead.",
      "Receipt numbers never restart and are never reused; receipts keep the prefix they were printed with.",
    ],
    faqs: [{ q: "Why aren't monthly fees charged automatically?", a: "So nothing is ever charged behind your back: you generate each month from a preview (Generate charges)." }],
  },
  {
    key: "fees-generate",
    title: "Generating charges",
    area: "Fees",
    permission: "fees.generate",
    summary: "Charges are what students owe. You create them from a preview: monthly fees month by month, one-time fees once per student.",
    steps: [
      "Choose the fee, and for a monthly fee the month (a future month is fine, for students paying ahead), then click Preview.",
      "Check who will be charged and who is skipped, with the reason for each.",
      "Untick anyone you don't want to charge now, or lower an amount (for example a student who joined late in the month).",
      "Click Create charges. The charges appear on each student's fees page.",
      "If a generation was wrong, use Recent generations → Cancel unpaid, with a reason.",
    ],
    rules: [
      "A month charges Active students who are in the course and joined by the end of that month. On hold, Completed and Left students, students who joined later, and students already charged are skipped.",
      "A student is never charged the same fee for the same month twice — even if two people generate at once. One-time fees are charged once per student.",
      "Students who join mid-month pay the full month unless you lower it here or waive part later.",
      "A monthly charge is due on the course's due day; one generated after that day is due on the day it's generated.",
      "Amounts can only be lowered in the preview, never raised.",
      "Cancelling keeps the charge on record as cancelled, with your reason. Paid charges can't be cancelled — void the payment first.",
    ],
    faqs: [
      { q: "A student was skipped as 'Joined after this month'.", a: "Their batch membership started after that month ended, so they don't owe it." },
      { q: "Can I charge a student I unticked later?", a: "Yes — preview the same month again; they'll be offered." },
    ],
  },
  {
    key: "fees-student",
    title: "Collecting payments and receipts",
    area: "Fees",
    permission: "fees.view",
    summary: "A student's fees page shows what they owe and have paid. Record money received here; each payment gets a receipt.",
    steps: [
      "Tick the charges being paid (oldest first). The total is worked out from them.",
      "Choose the method. Every method except cash needs a reference — the bKash/Nagad/Rocket transaction ID, cheque or bank reference.",
      "Choose the date the money was received (today or earlier) and click Record payment.",
      "Click Print receipt (or Print in Payments later) — reprinting never creates a new payment.",
      "Corrections: Void a wrong payment (with a reason) and record the right one; Waive part of an unpaid charge; Refund money given back; Add fine for a manual fine.",
    ],
    rules: [
      "Each charge is paid in full — there are no part-payments and no advance credit. To take money ahead, generate the future month first.",
      "Pressing Record payment twice records one payment.",
      "Voiding marks the receipt VOID (it can still be printed), makes its charges due again, and its number is never reused. Only Owner and Admin can void.",
      "Waivers (a fixed amount or a percent) apply to unpaid charges, can be added more than once, and never go below zero. Only Owner and Admin can waive.",
      "Refunds give back up to what was paid; the charge stays paid. Only Owner and Admin can refund, and a payment with refunds can't be voided.",
      "There are no automatic late fines — add a fine yourself, with a reason.",
      "Dues stay payable after a student leaves.",
    ],
    faqs: [
      { q: "The parent paid part of the month.", a: "Each charge is paid in full. Either collect the full amount, or waive the agreed part first (with a reason) and then collect the rest." },
      { q: "I recorded a payment against the wrong student.", a: "Void it with a reason, then record it again on the right student. The voided receipt stays on record." },
    ],
  },
  {
    key: "fees-reports",
    title: "Fee reports",
    area: "Fees",
    permission: "fees.report.view",
    summary: "Collections, dues and refunds, filtered by dates, course and batch, on screen or printed.",
    steps: [
      "Choose a report: Collections, Dues, Former students' dues, or Refunds.",
      "Set the dates (for collections and refunds), and narrow by course or batch if you like.",
      "Click Print for an A4 copy (your browser can also save it as PDF).",
    ],
    rules: [
      "Collections count valid payments only; voided receipts are listed separately, so every receipt number is accounted for.",
      "Net collection is money collected minus refunds in the same period.",
      "Dues list one line per student, most overdue first. Guardians' mobile numbers appear only for staff who may see contact details.",
      "Overdue means due before today.",
    ],
    faqs: [{ q: "Why is a payment shown with a smaller amount when I filter by course?", a: "A payment can cover charges of two courses; the report shows only the part that belongs to the chosen course." }],
  },
  {
    key: "attendance-registers",
    title: "Taking attendance",
    area: "Attendance",
    permission: "attendance.view",
    summary: "Each class has its own register. Pick the day, open a class, tap anyone who is absent, late or excused, and save — everyone else is Present.",
    steps: [
      "Open Attendance. Today's classes are listed from each batch's weekly schedule; use the arrows or the date box to see another day.",
      "Click a class to open its register. A register not taken yet starts with everyone Present.",
      "Tap A (Absent), L (Late) or E (Excused) for the exceptions, then click Save register.",
      "If a scheduled class didn't happen, click No class held and give the reason instead.",
      "For a make-up class that isn't on the schedule, click Extra class, choose the batch and subject, the date and the times, then take its register.",
    ],
    rules: [
      "Instructors see and take registers only for the subjects they teach. Owner and Admin see every class.",
      "A register can be taken or changed only on the class day (Bangladesh time). After that, only Owner or Admin can take or correct it, and they must give a reason.",
      "Every change after the first save is recorded in the audit log with the old and new status.",
      "Registers list the batch's current students on that day. Students On Hold are left off, and students who joined later don't appear on earlier registers.",
      "A student on approved leave shows as Excused automatically.",
      "Attendance percentage is (Present + Late) ÷ (Present + Late + Absent). Excused classes and classes not held count neither way.",
      "Nothing can be marked for a future class.",
    ],
    faqs: [
      { q: "I forgot to take yesterday's register.", a: "Ask an Owner or Admin. They can open yesterday's class and take it, with a reason such as 'Taken on paper'." },
      { q: "A student is missing from the register.", a: "They are either On Hold, not in this batch, or joined the batch after this day. Check the student's batches on their profile." },
      { q: "I marked a class as not held by mistake.", a: "On the same day, open it and take the register — it becomes a normal class again. Later, ask an Admin." },
    ],
  },
];

export const helpTopic = (key: HelpTopicKey) => HELP_TOPICS.find((t) => t.key === key)!;
