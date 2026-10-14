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
  area: "Getting started" | "Teaching" | "Students" | "Staff and access" | "Institute" | "Fees" | "Attendance" | "Exams" | "Routine" | "Website";
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
  | "fees-counter"
  | "attendance-registers"
  | "attendance-leave"
  | "leave-student"
  | "attendance-reports"
  | "exams-setup"
  | "exams-grading"
  | "exams-marks"
  | "exams-results"
  | "results-student"
  | "routine"
  | "lesson-plans"
  | "website"
  | "website-notices"
  | "website-gallery"
  | "website-testimonials"
  | "website-faculty"
  | "website-achievers"
  | "website-enquiries";

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
      "To give a discount or add a fine at the same time, click Add waiver to payment (on a ticked charge) or Add fine to payment before Record payment — they are saved together with the payment.",
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
    key: "fees-counter",
    title: "The fees counter: Collect and Payments",
    area: "Fees",
    permission: "fees.view",
    summary: "Collect is the quickest way to take money at the counter: find the student, tick what they're paying, record it and print the receipt. Payments lists every receipt for the days you choose.",
    steps: [
      "Open Fees → Collect and type the student's name or ID (staff who can see contacts can also type a mobile number). Click the student.",
      "Tick the charges being paid. If you're giving a discount, click Add waiver to payment; for a late fine, click Add fine to payment (a fine can also be collected on its own). The total updates as you go.",
      "Choose the method (and reference, except for cash) and the date received, then click Record payment.",
      "Click Print receipt. Click Another student for the next person in the queue.",
      "Open Fees → Payments to see every receipt for a day or range — today by default — with the total. Print any receipt again, or Void one with a reason.",
    ],
    rules: [
      "Each charge is paid in full; there are no part-payments.",
      "Waivers and fines added while collecting are saved together with the payment. If anything is wrong, nothing is saved.",
      "A waiver can only be on a ticked charge and can't take it below zero. If a waiver covers a charge completely, that charge is settled by the waiver and isn't on the receipt.",
      "Adding waivers needs Owner or Admin (the waive permission); adding fines needs the adjust permission.",
      "Pressing Record payment twice records one payment, and its waivers and fines once.",
      "The Payments total leaves out voided receipts. Only Owner and Admin can void, and a payment with refunds can't be voided.",
    ],
    faqs: [
      { q: "The waivers cover everything I ticked.", a: "Then there's nothing to collect. Use Waive on the student's fees page instead." },
      { q: "Where's the receipt for yesterday?", a: "Fees → Payments, choose yesterday's date, and click Print on the receipt." },
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
  {
    key: "attendance-leave",
    title: "Student leave",
    area: "Attendance",
    permission: "leave.manage",
    summary: "Students apply for leave in their portal and you approve or reject it here. You can also enter leave yourself when a guardian calls. Approved leave marks the student Excused for those days.",
    steps: [
      "Open Attendance → Leave. Applications waiting for a decision are shown first.",
      "Click Approve or Reject. You can add a note — the student sees it.",
      "When a guardian asks by phone or in person, click Enter leave, find the student, choose the first and last day and give the reason. It is approved at once.",
      "If leave was approved by mistake, or the student came after all, click Revoke and give the reason.",
    ],
    rules: [
      "Approved leave makes the student Excused in every class on those days — registers already taken change, and registers taken later start with the student as Excused.",
      "Excused classes count neither for nor against the attendance percentage.",
      "Revoking leave puts each class back as it was marked before, or unmarked if nobody marked it. The leave stays on record as revoked.",
      "A student can apply for up to 7 days back, or any future date. The office can enter any dates.",
      "A student can't have two applications covering the same day while one is waiting or approved.",
      "Students can withdraw an application only while it's waiting. Rejected, withdrawn and revoked leave change nothing on the registers.",
      "Every decision is recorded in the audit log.",
    ],
    faqs: [
      { q: "A student came to class on a day they had leave.", a: "Revoke the leave with a reason (or enter a shorter leave after revoking). The classes go back to how they were marked." },
      { q: "The register still shows the student Present on a leave day.", a: "Only approved leave excuses classes. Check the application isn't still waiting for a decision." },
    ],
  },
  {
    key: "leave-student",
    title: "Leave in the student portal",
    area: "Attendance",
    permission: "leave.self.apply",
    summary: "Apply for leave for days you'll miss, or missed in the last 7 days. The office approves or rejects it; approved leave marks you Excused for those days.",
    steps: [
      "Choose the first and last day, write the reason, and click Apply.",
      "Your application shows as Waiting for a decision until the office decides.",
      "If you no longer need it, click Withdraw while it's still waiting.",
    ],
    rules: [
      "You can apply for up to 7 days back, or any day in the future. For earlier days, ask the office.",
      "You can't apply twice for the same day while an application is waiting or approved.",
      "Approved leave marks you Excused, which doesn't lower your attendance percentage.",
      "The office may add a note to its decision; you'll see it here.",
    ],
    faqs: [
      { q: "My leave was rejected but I still can't come.", a: "Talk to the office. They can enter leave for you, for any dates." },
    ],
  },
  {
    key: "attendance-reports",
    title: "Attendance reports",
    area: "Attendance",
    permission: "attendance.report.view",
    summary: "See a batch's register for a month (and print it), find students whose attendance is low, and list who was absent on a day — with guardian mobiles to call, if you're allowed to see them.",
    steps: [
      "Open Attendance → Reports and choose a report.",
      "Monthly register: choose the batch, one subject or all, and the month. Each column is a class that was taken; click Print for an A4 copy.",
      "Low attendance: choose the dates, the percentage (for example 75) and optionally a batch. Students below it are listed, lowest first.",
      "Absentees by day: choose the date and optionally a batch to see who was absent and which classes they missed.",
      "For one student's attendance, open their profile: the Attendance card shows the last 30 days, or any dates you choose.",
    ],
    rules: [
      "Only registers that were taken count. Classes marked 'No class held' count for nobody.",
      "Percentage is (Present + Late) ÷ (Present + Late + Absent). Excused classes (approved leave) count neither way.",
      "Students on approved leave are Excused, so they never appear as absent.",
      "Guardian mobiles appear only for staff allowed to see student contacts. Instructors never see them.",
      "Instructors see reports only for the subjects they teach.",
      "Reports include archived batches, so past months stay available.",
    ],
    faqs: [
      { q: "A student shows no percentage.", a: "All their counted classes were Excused, or no register with them was taken in those dates." },
      { q: "Why is a day missing from the monthly register?", a: "Either no register was taken that day, or the class was marked not held (the report says how many weren't held)." },
    ],
  },
  {
    key: "exams-setup",
    title: "Setting up exams",
    area: "Exams",
    permission: "exams.view",
    summary: "An exam belongs to one course and is sat by one or more of its batches. It has one paper per subject, each with full and pass marks, and a paper can be split into parts such as Written and MCQ.",
    steps: [
      "Open Exams and click New exam. Choose the course, give the exam a name and kind (weekly, monthly, model or custom — just a label), and its first and last day.",
      "Tick the batches that sit it. Their students are ranked together in one merit list.",
      "Add a paper for each subject, with its full and pass marks. Click Split into parts if the paper has a written and an MCQ part with their own pass marks; the parts must add up to the paper's full marks.",
      "Tick Optional (4th subject) for an optional subject: only its grade points above 2.0 add to the GPA, and failing it never fails the student.",
      "Turn off Show grades and GPA for a quick test where only marks, pass/fail and position matter. Then click Create exam.",
    ],
    rules: [
      "Students in the exam's batches on its first day sit it. Students On Hold are left off.",
      "A student fails the exam if any compulsory paper is below its pass mark, or any part is below its own pass mark. With grades shown, an F grade is also a fail.",
      "Once a paper has marks, its full marks, pass marks, parts and optional setting are locked, and it can't be removed. A batch whose students have marks can't be removed either.",
      "A published exam keeps its batches and papers; only its name, kind, dates and syllabus can change.",
      "An exam can be deleted only while it has no marks.",
      "Instructors see the exams of batches they teach. Only Owner and Admin create exams and publish results.",
    ],
    faqs: [
      { q: "I set the wrong full marks and marks are already entered.", a: "The paper is locked to protect the marks. Ask whoever entered them to clear them, or create the exam again." },
      { q: "Can one exam cover two courses?", a: "No. An exam belongs to one course; create one exam per course." },
    ],
  },
  {
    key: "exams-grading",
    title: "The grading scale",
    area: "Exams",
    permission: "exams.manage",
    summary: "Grades come from the percentage a student gets in a paper. The Bangladesh 5.0 scale is used until you change it here.",
    steps: [
      "Open Exams → Grading scale.",
      "Change a grade's name, the percentage it starts from, or its grade point; add or remove grades.",
      "Click Save scale. To undo your changes later, click Use the Bangladesh 5.0 scale.",
    ],
    rules: [
      "A mark gets the highest grade whose starting percentage it reaches: 79.99% is an A, not an A+.",
      "The lowest grade must start at 0% and be worth 0 points — it is the fail grade. No other grade can be worth 0.",
      "A higher grade can't be worth fewer points than a lower one.",
      "GPA is the average of the compulsory papers' grade points, to two decimals, plus the optional subject's points above 2.0, capped at the top grade point.",
      "Exams already published keep the scale they were published with. Draft exams, and exams published later, use the new scale.",
    ],
    faqs: [{ q: "Will changing the scale change results students have seen?", a: "No. A published exam keeps its scale; only draft and future exams use the new one." }],
  },
  {
    key: "exams-marks",
    title: "Entering marks",
    area: "Exams",
    permission: "exams.view",
    summary: "Each paper has its own marks page: one row per student who sits it, with a box for each part (or one for the whole paper) and an Absent tick.",
    steps: [
      "Open the exam and click Enter marks next to the paper.",
      "Type each student's mark — after any negative marking — with up to two decimals (e.g. 21.25). For a paper with parts, fill every part.",
      "Tick Absent for a student who missed the paper. Leave a row empty if you don't have the mark yet.",
      "Click Save. You can come back and change marks while the exam is a draft.",
    ],
    rules: [
      "The list shows the students in the exam's batches on its first day. Students On Hold, and students who joined later, aren't on it. A student who leaves later keeps their marks.",
      "Instructors see and enter marks only for the subjects they teach, in their own batches.",
      "A mark can't be more than the paper's (or part's) full marks. The system doesn't calculate negative marking: enter the final mark.",
      "Absent fails the paper. A zero is a real mark, not an absence.",
      "A student with a part still empty has no result yet; their result appears once every part is entered.",
      "After results are published, only Owner or Admin can correct a mark, with a reason. The change is recorded in the audit log and students see the corrected result.",
      "Once a paper has marks, its full marks, pass marks and parts can't change.",
    ],
    faqs: [
      { q: "I entered a mark for the wrong student.", a: "While the exam is a draft, clear the boxes (or untick Absent) and save; then enter it for the right student." },
      { q: "A student isn't on the list.", a: "They are On Hold, joined the batch after the exam's first day, or are in a batch that doesn't sit the exam." },
    ],
  },
  {
    key: "exams-results",
    title: "Results and publishing",
    area: "Exams",
    permission: "exams.view",
    summary: "Results are worked out from the marks as soon as they are entered. When every mark is in, Owner or Admin publish the exam and students see their results and marksheets.",
    steps: [
      "Open the exam and click Results. The merit list ranks every batch together; choose a batch to see just its students (with their overall position).",
      "While it's a draft, the note at the top lists anyone still missing a mark. Enter the mark or tick Absent.",
      "Click Publish results. All batches are published together.",
      "Print the merit list, or marksheets for everyone, a batch, or one student.",
    ],
    rules: [
      "Positions: students who passed come first, then higher total marks, then higher GPA (when grades are shown). Equal students share a position and the next one is skipped (1, 1, 3).",
      "A student absent from every paper isn't ranked. A student who failed is ranked after everyone who passed.",
      "The total includes an optional (4th) subject only if the student sat it.",
      "Results can't be published while anyone is missing a mark in a compulsory paper. An optional paper left empty means the student didn't take it.",
      "Publishing keeps the current grading scale with the exam, so a later change to the scale doesn't change these grades.",
      "After publishing, Owner or Admin can correct a mark with a reason; the result and positions update straight away and the change is in the audit log.",
      "Students only ever see published results. Instructors see the results of their own batches.",
      "Marksheets print once results are published; the merit list can be printed as a draft for checking.",
    ],
    faqs: [
      { q: "Publishing says marks are missing.", a: "The message names each student and paper. Open that paper's marks, enter the mark or tick Absent, then publish again." },
      { q: "Why did a student's position change after publishing?", a: "A mark was corrected. Corrections update everyone's positions; the audit log shows who changed what and why." },
    ],
  },
  {
    key: "results-student",
    title: "Your results",
    area: "Exams",
    permission: "exams.self.view",
    summary: "Your exam results appear here once the office publishes them, with your marks in each subject, your total, GPA (when shown) and your position.",
    steps: ["Open Results to see each published exam.", "Click Marksheet to open your marksheet, then print it or save it as a PDF."],
    rules: [
      "Your position is among everyone who sat the exam, across all batches.",
      "An optional (4th) subject only adds the part of its grade point above 2.0 to your GPA, and never fails you.",
      "If a mark is corrected after publishing, your result here updates.",
    ],
    faqs: [{ q: "I think a mark is wrong.", a: "Talk to your instructor or the office. Only Owner or Admin can correct a published mark." }],
  },
  {
    key: "routine",
    title: "The routine and its changes",
    area: "Routine",
    permission: "routine.view",
    summary: "The routine shows every class with what changed: cancelled, moved to another time, taken by a substitute, or closed for a holiday. The weekly times themselves are set on each batch's page.",
    steps: [
      "Open Routine. Day shows every class today; Batch week and Instructor week show seven days from the date you choose.",
      "To change one class, find it and click Change: cancel it (with a reason), move it to another date and time, or choose a substitute instructor.",
      "To close the institute, open Changes & holidays and click Add holiday with the first and last day. Every class on those days is cancelled.",
      "Made a mistake? Click Undo change (or Withdraw for a holiday): the class goes back to its regular time and instructor.",
    ],
    rules: [
      "Only Owner and Admin change the routine; instructors ask the office.",
      "A change affects one class on one date. To change a batch's regular weekly times, edit the batch.",
      "A moved class or a substitute can't clash with the instructor's other classes that day, counting other changes. A class can't be moved onto a holiday.",
      "Each class can have one change at a time. To make a different change, undo the first one.",
      "Changing a class whose date has passed needs a reason. A cancellation always needs a reason.",
      "Undoing a change or a holiday keeps it on record as withdrawn; every change is in the audit log.",
      "Instructors see the routine of the batches they teach; students see their own week with the changes.",
    ],
    faqs: [
      { q: "The instructor is ill all week.", a: "Choose a substitute for each class, or cancel them. For the whole institute, add a holiday instead." },
      { q: "Why can't I choose a certain substitute?", a: "They already teach the class, are inactive, or teach another class at that time." },
    ],
  },
  {
    key: "lesson-plans",
    title: "Lesson plans",
    area: "Routine",
    permission: "routine.view",
    summary: "Each subject of each batch has its own lesson plan: the chapters or topics it will cover, in order, with start and target dates and how far the class has got.",
    steps: [
      "Open Routine → Lesson plans and click a subject of a batch.",
      "Add each chapter or topic with its start and target dates (both optional). Use the arrows to put them in teaching order.",
      "As teaching goes on, set each topic's status: Pending, Ongoing or Completed. Completing a topic records today's date.",
      "For another batch of the same subject, the office can click Copy from another batch to start from that batch's topics.",
    ],
    rules: [
      "A topic that is past its target date and not completed shows Overdue.",
      "The subject's instructor(s) and Owner or Admin can edit a plan. Other instructors of the batch can see it.",
      "Copying adds the other batch's topics to the end, in order, as Pending and without dates.",
      "Students see their batches' plans and progress in their portal.",
    ],
    faqs: [{ q: "A topic is finished early.", a: "Set it to Completed; the date is recorded and it no longer counts as Overdue." }],
  },
  {
    key: "website",
    title: "Your website",
    area: "Website",
    permission: "website.manage",
    summary: "Your institute's public website at its own address. Make it your own: twelve themes, about thirty colour palettes or your own colours, gradients, eighteen fonts (Bangla ones too), button and card styles, backgrounds such as Nakshi Kantha and Alpana, and light or dark. Choose layouts, write your own words, switch the whole site to Bangla, and choose which sections appear and in what order.",
    steps: [
      "Open Website. On the Look tab, pick a theme. A theme brings its own fonts, shapes and background; your colours stay. Changed your mind? Click Undo.",
      "Under Colours, pick a palette, your brand colour from Institute Settings, or Custom to choose your own two colours. Pick a gradient for gradient buttons and colourful banners.",
      "Under Fonts, Shapes & spacing and Background & appearance, adjust anything you like. The Style sample on the right shows your colours, fonts, buttons and cards as you change them.",
      "On the Layout tab, choose the header, the welcome banner's layout (the theme's own or another theme's), how dark the shade over its picture is, and how courses, notices, the gallery and testimonials are laid out.",
      "On the Content tab, choose the website's language (English or বাংলা). Then, under Welcome banner, write the heading and a line under it, add a background picture, and choose the button: Enquire, Call, or none.",
      "Under About, write a few lines about your institute and add a picture.",
      "Further down the Content tab: Stats (big numbers that count up, e.g. 1200+ students taught), Why choose us (reasons with icons), Questions & answers, and a YouTube Video. Each section stays hidden while it's empty.",
      "Still on the Content tab: an Announcement bar (one line at the very top, e.g. 'Admission open for HSC 2027', with an optional link and a last day) and your Social links (Facebook, YouTube, Instagram, TikTok, LinkedIn).",
      "Your website has pages: Home, About us, Courses, Teachers, Results, Gallery, Notices, Admission and Contact. Each section lives on its own page; the Sections tab shows which. Switch On Home for the sections you also want on the home page.",
      "On the Sections tab, click the pencil to rename a section's heading or add a line under it. Then switch each section on or off and use the arrows to set their order. The welcome banner is always at the top. Notices, Gallery, Testimonials and Enquiries have their own tabs.",
      "Click Save. The website changes straight away; click View website to see it.",
    ],
    rules: [
      "Every save is public at once. There is no draft; the Style sample and View website show the result.",
      "Text in your colours is darkened or lightened automatically so it always reads clearly, in light and dark, whatever colours you choose.",
      "Light or dark: Visitor's choice follows each visitor's phone and shows a switch; Always light or Always dark fixes it.",
      "Language: বাংলা changes every built-in label (menu, headings, the enquiry form, the footer) and shows numbers, class times and dates in Bangla digits. What you write yourself (notices, course names, your own headings) is shown as you wrote it.",
      "The announcement bar disappears by itself after its Show until day. A visitor who closes it doesn't see it again during that visit.",
      "Social links must point to that network (a Facebook link to facebook.com, and so on).",
      "A page with nothing to show (for example Teachers before you add any) is left out of the menu. Each page has its own address, such as /courses or /admission, which you can share on Facebook.",
      "On Home, list sections end with a 'See all' link to their page. Old links to a section (such as #enquiry in the announcement bar) still work: they open the section's page.",
      "The video loads from YouTube only when a visitor taps play, so the page stays fast on mobile data.",
      "The moving effects are the same for every website and need no setting: the banner rises in, sections and cards glide into view as visitors scroll, numbers count up, cards tilt under the mouse, and 3D shapes float in the banner. They switch off for visitors whose phone or computer asks for less motion.",
      "Faculty and Achievers have their own tabs. Faculty shows only the instructors you add, with name, photo and subjects; never phone numbers or emails.",
      "Pictures can be JPG, PNG or WebP up to 5 MB; they are resized and compressed when uploaded.",
      "A section with nothing to show stays hidden, with its menu link: About without text or a picture, Courses with no active course, Notices, Gallery or Testimonials while empty, Contact without any contact details.",
      "The banner's Enquire button shows only while the Admission enquiry form section is on.",
      "Courses & batches lists your active courses with their subjects and class times; instructor names are never shown.",
      "Contact & map shows a map of the address set in Institute Settings, with an Open in Maps link.",
      "Only Owner and Admin can change the website.",
      "If the Website module is switched off, your address shows the basic institute page again; the website's settings are kept for when it's switched back on.",
    ],
    faqs: [
      { q: "How do I change the colours?", a: "On the Look tab, under Colours: pick a palette, Brand colour (the primary colour from Institute Settings), or Custom for your own." },
      { q: "I picked a theme and my fonts changed.", a: "A theme brings its own fonts, shapes and background. Click Undo right below the themes, or change them again under Fonts and Shapes & spacing." },
      { q: "How do I choose what is on the home page?", a: "On the Sections tab, switch On Home for each section you want there. Every section still has its own page, so nothing is lost when it isn't on Home." },
      { q: "Can my website be fully in Bangla?", a: "Yes. On the Content tab choose বাংলা: the menu, headings, enquiry form and footer switch to Bangla. Write your own texts in Bangla too, and pick a Bangla font under Look." },
      { q: "Will the Bangla text look right?", a: "Yes. Every font shows Bangla correctly, and the Bangla fonts (Hind Siliguri, Anek Bangla, Baloo Da 2, Noto Serif Bengali, Tiro Bangla) are designed for it." },
      { q: "The map shows the wrong place.", a: "Write the address in Institute Settings as Google Maps would find it, e.g. with the area and city." },
      { q: "Can I add my own page or HTML?", a: "Not in this version: the website is built from its sections only." },
    ],
  },
  {
    key: "website-notices",
    title: "Website notices",
    area: "Website",
    permission: "website.manage",
    summary: "Notices tell visitors what's happening: admission dates, exam schedules, holiday closures. They appear in the Notices section of your website.",
    steps: [
      "Open Website → Notices and click Add notice.",
      "Write a title and the text. The notice date is today unless you choose another day; a later date schedules it.",
      "Optionally choose Show until: after that day the notice leaves the website by itself.",
      "Tick Pin to keep an important notice at the top. Click Save notice; it is public at once.",
    ],
    rules: [
      "The website shows notices from their notice date until their Show until date, pinned ones first, then the newest, at most 10.",
      "A notice can be hidden from the website and shown again later; notices are never deleted, so the office list keeps them all.",
      "Each notice's status shows where it stands: On the website, Scheduled, Ended or Hidden.",
      "Long notices open with Read more on the website. Notices have no attachments.",
      "Notices are for the public website only; they don't reach students' or instructors' portals.",
    ],
    faqs: [
      { q: "A notice has a mistake.", a: "Open its actions and click Edit; the website changes when you save." },
      { q: "Can I schedule a notice for next week?", a: "Yes: set its notice date to that day. It shows as Scheduled until then." },
    ],
  },
  {
    key: "website-gallery",
    title: "Website gallery",
    area: "Website",
    permission: "website.manage",
    summary: "Photos of your classes, events and achievements, shown in the Gallery section of your website.",
    steps: [
      "Open Website → Gallery and click Add photos. You can choose several pictures at once.",
      "Click the pencil under a photo to give it a caption.",
      "Use the arrows to put the photos in the order you want.",
      "Click the bin to remove a photo you no longer want.",
    ],
    rules: [
      "The gallery holds up to 60 photos.",
      "Each photo can be JPG, PNG or WebP up to 5 MB; it is resized and compressed when uploaded.",
      "Changes are public at once. Removing a photo takes it off the website straight away.",
      "On the website a photo opens full size when clicked.",
    ],
    faqs: [
      { q: "The gallery is full.", a: "Remove older photos to make room for new ones." },
      { q: "A photo appears sideways.", a: "Rotate it on your phone or computer and upload it again." },
    ],
  },
  {
    key: "website-testimonials",
    title: "Website testimonials",
    area: "Website",
    permission: "website.manage",
    summary: "Words from successful students and happy guardians, entered by the office and shown in the Testimonials section of your website.",
    steps: [
      "Open Website → Testimonials and click Add testimonial.",
      "Write what they said and their name. Optionally add a line under the name, e.g. 'HSC 2025, GPA 5', and a photo.",
      "Use the arrows to set the order; the first one shows first on the website.",
    ],
    rules: [
      "Only the office adds testimonials; visitors can't submit them.",
      "Add a person's words or photo only with their permission.",
      "Changes are public at once. Removing a testimonial takes it off the website straight away.",
    ],
    faqs: [{ q: "Someone asked to be removed.", a: "Open their testimonial's actions and click Remove." }],
  },
  {
    key: "website-faculty",
    title: "Website faculty",
    area: "Website",
    permission: "website.manage",
    summary: "Show your instructors in the Faculty section of your website: their photo, name and the subjects they teach, with an optional line such as 'BUET, 8 years teaching'.",
    steps: [
      "Open Website → Faculty and click Add instructor.",
      "Choose an active instructor and, if you like, write a line under their name. Click Add to website.",
      "Use the arrows to set the order. To change a photo, open the instructor in Instructors and upload it there.",
    ],
    rules: [
      "Only the instructors you add are shown. Nobody appears on the website automatically.",
      "The website shows the name, photo, subjects (from their active batches) and your line; never their phone number, email or address.",
      "An instructor who becomes inactive disappears from the website by itself, and their photo stops being public.",
      "Taking someone off the website changes only the website; the instructor and their batches stay as they are.",
      "Changes are public at once.",
    ],
    faqs: [
      { q: "An instructor has no photo on the website.", a: "Add a photo to their profile in Instructors; the website uses the same photo." },
      { q: "The subjects are wrong.", a: "They come from the batches the instructor teaches. Update the batch's subjects and instructors in Courses & batches." },
    ],
  },
  {
    key: "website-achievers",
    title: "Website achievers",
    area: "Website",
    permission: "website.manage",
    summary: "Celebrate top results in the Achievers section of your website: each with the student's name, the result (e.g. 'GPA 5.00'), the exam (e.g. 'SSC 2025') and an optional photo.",
    steps: [
      "Open Website → Achievers and click Add achiever.",
      "Write the student's name and result, and optionally the exam and a photo.",
      "Use the arrows to set the order; the first one shows first.",
    ],
    rules: [
      "Achievers are typed in by the office; they are not linked to student records, so nothing about a student is published automatically.",
      "Add a name or photo only with the student's or guardian's permission.",
      "Up to 48 achievers. Changes are public at once.",
    ],
    faqs: [{ q: "A guardian asked us to remove their child.", a: "Open the achiever's actions and click Remove; they leave the website at once." }],
  },
  {
    key: "website-enquiries",
    title: "Admission enquiries",
    area: "Website",
    permission: "website.manage",
    summary: "Visitors to your website send an admission enquiry with the student's name, a mobile number, the course they're interested in and a message. They arrive here for the office to call back.",
    steps: [
      "Make sure the Admission enquiry form section is switched on under Website → Design.",
      "Open Website → Enquiries. New enquiries show first; use the filters to see the others.",
      "Call the number, then open the enquiry's actions to mark it Contacted and add a note of what was agreed.",
      "When the student joins, click Convert: admission opens with the name, mobile number and course filled in. Admit the student and the enquiry becomes Converted, linked to the new student.",
      "If they don't join, Close the enquiry. A closed enquiry can be reopened.",
    ],
    rules: [
      "Statuses: New → Contacted → Converted or Closed. Contacted can go back to New; Closed can be reopened; Converted is final.",
      "Every status change is recorded in the audit log.",
      "The mobile number must be a valid Bangladeshi mobile; the form tidies it to 01XXXXXXXXX.",
      "Spam protection: a hidden field that only robots fill, a minimum time to fill the form, and at most 5 enquiries an hour from one internet address.",
      "No SMS or email is sent for a new enquiry; check this inbox regularly.",
      "Only Owner and Admin see enquiries. Convert also needs permission to admit students.",
      "A course that has enquiries can't be deleted; archive it instead.",
    ],
    faqs: [
      { q: "The mobile number was the guardian's, not the student's.", a: "At admission it is filled in as the guardian's mobile; move it if it's the student's own." },
      { q: "A visitor says the form told them to try later.", a: "They sent 5 enquiries within an hour from one connection. Ask them to call, or wait an hour." },
    ],
  },
];

export const helpTopic = (key: HelpTopicKey) => HELP_TOPICS.find((t) => t.key === key)!;
