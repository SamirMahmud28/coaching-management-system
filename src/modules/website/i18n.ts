import type { SiteLanguage, WebsiteSectionKey } from "@/server/modules/website/design";
import type { Weekday } from "@/server/modules/academic/service";

// Every built-in label on the public website, in English and Bangla (D140). What the office writes (headings, notices,
// course names) is shown as written. In Bangla, numbers, times and dates use Bangla digits.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Bangla digits for every Western digit in `text`. */
export const bnDigits = (text: string) => text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

export interface EnquiryLabels {
  form: string;
  name: string;
  mobile: string;
  course: string;
  notSure: string;
  message: string;
  messageHint: string;
  send: string;
  thanks: string;
  thanksLine: string;
  nameMissing: string;
  mobileMissing: string;
  /** Null: show the server's own message (English). */
  mobileInvalid: string | null;
  failed: string;
  offline: string;
}

export interface SiteLabels {
  lang: "en" | "bn";
  /** Digits in the site's language. */
  num: (text: string) => string;
  date: (iso: string) => string;
  nav: Record<WebsiteSectionKey, string>;
  title: Record<WebsiteSectionKey, string>;
  subtitle: Partial<Record<WebsiteSectionKey, string>>;
  aboutTitle: (name: string) => string;
  welcome: string;
  enquire: string;
  call: (phone: string) => string;
  subjects: string;
  timesTba: string;
  everyDay: string;
  day: Record<Weekday, string>;
  pinned: string;
  readMore: string;
  showLess: string;
  enquiryIntro: string;
  ratherTalk: string;
  openInMaps: string;
  mapOf: (name: string) => string;
  signIn: string;
  staffSignIn: string;
  sectionsNav: string;
  close: string;
  more: string;
  playVideo: string;
  menu: string;
  previous: string;
  next: string;
  follow: string;
  enquiry: EnquiryLabels;
}

const EN: SiteLabels = {
  lang: "en",
  num: (t) => t,
  date: (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  nav: {
    ABOUT: "About", STATS: "Results", FEATURES: "Why us", COURSES: "Courses", FACULTY: "Teachers", ACHIEVERS: "Achievers", NOTICES: "Notices", GALLERY: "Gallery", VIDEO: "Video",
    TESTIMONIALS: "Testimonials", FAQ: "FAQ", ENQUIRY: "Admission", CONTACT: "Contact",
  },
  title: {
    ABOUT: "About", STATS: "Our results in numbers", FEATURES: "Why choose us", COURSES: "Courses", FACULTY: "Our teachers", ACHIEVERS: "Our achievers", NOTICES: "Notices",
    GALLERY: "Gallery", VIDEO: "See us in action", TESTIMONIALS: "What our students say", FAQ: "Frequently asked questions", ENQUIRY: "Admission enquiry", CONTACT: "Contact us",
  },
  subtitle: { COURSES: "Our courses, subjects and class times.", ACHIEVERS: "Students who made us proud." },
  aboutTitle: (name) => `About ${name}`,
  welcome: "Welcome",
  enquire: "Enquire about admission",
  call: (phone) => `Call ${phone}`,
  subjects: "Subjects: ",
  timesTba: "Class times to be announced",
  everyDay: "Every day",
  day: { SAT: "Sat", SUN: "Sun", MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri" },
  pinned: "Pinned",
  readMore: "Read more",
  showLess: "Show less",
  enquiryIntro: "Tell us who the student is and how to reach you. We'll call you back about courses, batches and admission.",
  ratherTalk: "Rather talk now?",
  openInMaps: "Open in Maps",
  mapOf: (name) => `Map of ${name}`,
  signIn: "Sign in",
  staffSignIn: "Students and staff: sign in",
  sectionsNav: "Sections",
  close: "Close",
  more: "Learn more",
  playVideo: "Play video",
  menu: "Menu",
  previous: "Previous",
  next: "Next",
  follow: "Follow us",
  enquiry: {
    form: "Admission enquiry",
    name: "Student's name",
    mobile: "Mobile number",
    course: "Course",
    notSure: "Not sure yet",
    message: "Message",
    messageHint: "Class, preferred batch time, or any question",
    send: "Send enquiry",
    thanks: "Thank you! Your enquiry has been sent.",
    thanksLine: "We'll call you on the number you gave us.",
    nameMissing: "Please write the student's name.",
    mobileMissing: "Please write a mobile number.",
    mobileInvalid: null,
    failed: "Something went wrong. Please try again, or call us.",
    offline: "Couldn't send. Check your connection and try again.",
  },
};

const BN: SiteLabels = {
  lang: "bn",
  num: bnDigits,
  date: (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  nav: {
    ABOUT: "আমাদের কথা", STATS: "ফলাফল", FEATURES: "কেন আমরা", COURSES: "কোর্স", FACULTY: "শিক্ষক", ACHIEVERS: "কৃতী শিক্ষার্থী", NOTICES: "নোটিশ", GALLERY: "গ্যালারি", VIDEO: "ভিডিও",
    TESTIMONIALS: "মতামত", FAQ: "জিজ্ঞাসা", ENQUIRY: "ভর্তি", CONTACT: "যোগাযোগ",
  },
  title: {
    ABOUT: "আমাদের কথা", STATS: "সংখ্যায় আমাদের সাফল্য", FEATURES: "কেন আমাদের বেছে নেবেন", COURSES: "কোর্সসমূহ", FACULTY: "আমাদের শিক্ষকবৃন্দ", ACHIEVERS: "আমাদের কৃতী শিক্ষার্থী",
    NOTICES: "নোটিশ", GALLERY: "গ্যালারি", VIDEO: "ভিডিওতে আমরা", TESTIMONIALS: "শিক্ষার্থীরা যা বলে", FAQ: "সাধারণ জিজ্ঞাসা", ENQUIRY: "ভর্তি সংক্রান্ত জিজ্ঞাসা", CONTACT: "যোগাযোগ করুন",
  },
  subtitle: { COURSES: "আমাদের কোর্স, বিষয় ও ক্লাসের সময়।", ACHIEVERS: "যাদের সাফল্যে আমরা গর্বিত।" },
  aboutTitle: (name) => `${name} সম্পর্কে`,
  welcome: "স্বাগতম",
  enquire: "ভর্তির জন্য যোগাযোগ করুন",
  call: (phone) => `কল করুন ${bnDigits(phone)}`,
  subjects: "বিষয়: ",
  timesTba: "ক্লাসের সময় শীঘ্রই জানানো হবে",
  everyDay: "প্রতিদিন",
  day: { SAT: "শনি", SUN: "রবি", MON: "সোম", TUE: "মঙ্গল", WED: "বুধ", THU: "বৃহস্পতি", FRI: "শুক্র" },
  pinned: "পিন করা",
  readMore: "আরও পড়ুন",
  showLess: "কম দেখান",
  enquiryIntro: "শিক্ষার্থীর নাম ও আপনার মোবাইল নম্বর দিন। কোর্স, ব্যাচ ও ভর্তি নিয়ে আমরা আপনাকে ফোন করব।",
  ratherTalk: "এখনই কথা বলতে চান?",
  openInMaps: "ম্যাপে দেখুন",
  mapOf: (name) => `${name}-এর ম্যাপ`,
  signIn: "সাইন ইন",
  staffSignIn: "শিক্ষার্থী ও শিক্ষক: সাইন ইন",
  sectionsNav: "বিভাগসমূহ",
  close: "বন্ধ করুন",
  more: "বিস্তারিত",
  playVideo: "ভিডিও চালান",
  menu: "মেনু",
  previous: "আগের",
  next: "পরের",
  follow: "আমাদের অনুসরণ করুন",
  enquiry: {
    form: "ভর্তি সংক্রান্ত জিজ্ঞাসা",
    name: "শিক্ষার্থীর নাম",
    mobile: "মোবাইল নম্বর",
    course: "কোর্স",
    notSure: "এখনও ঠিক করিনি",
    message: "বার্তা",
    messageHint: "শ্রেণি, পছন্দের ব্যাচের সময় বা যেকোনো প্রশ্ন",
    send: "পাঠান",
    thanks: "ধন্যবাদ! আপনার বার্তা পাঠানো হয়েছে।",
    thanksLine: "আপনার দেওয়া নম্বরে আমরা ফোন করব।",
    nameMissing: "শিক্ষার্থীর নাম লিখুন।",
    mobileMissing: "একটি মোবাইল নম্বর লিখুন।",
    mobileInvalid: "সঠিক মোবাইল নম্বর লিখুন, যেমন ০১৭১২৩৪৫৬৭৮।",
    failed: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন, অথবা আমাদের ফোন করুন।",
    offline: "পাঠানো যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
  },
};

export const SITE_LABELS: Record<SiteLanguage, SiteLabels> = { EN, BN };
