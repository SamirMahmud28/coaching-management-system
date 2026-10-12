/**
 * Taka amounts. The database stores numeric(14,2); all arithmetic happens here in integer poisha (1 taka = 100
 * poisha), so sums, splits and percentages never drift the way floating-point taka would. Pure: used on both sides.
 */

/** The largest amount accepted anywhere: 9,999,999,999.99 taka. */
export const MAX_POISHA = 999_999_999_999;

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** A taka amount as typed or sent: digits with at most two decimals ("2000", "2000.5", "2000.50"). */
export function isAmountText(value: string): boolean {
  return AMOUNT_RE.test(value.trim());
}

/** Poisha from a taka string ("2000.50" → 200050). Throws on anything that isn't a plain non-negative amount. */
export function toPoisha(value: string): number {
  const text = value.trim();
  if (!AMOUNT_RE.test(text)) throw new RangeError(`Not a taka amount: "${value}"`);
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** The taka string the database and the API use ("200050" poisha → "2000.50"). */
export function fromPoisha(poisha: number): string {
  if (!Number.isSafeInteger(poisha)) throw new RangeError(`Not a whole number of poisha: ${poisha}`);
  const sign = poisha < 0 ? "-" : "";
  const abs = Math.abs(poisha);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** "৳2,00,000.50", grouped the way Bangladesh writes numbers (lakh, crore). */
export function formatTaka(poisha: number): string {
  const sign = poisha < 0 ? "−" : "";
  const abs = Math.abs(poisha);
  return `${sign}৳${grouping.format(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}

/** `percent` (up to two decimals, 0–100) of an amount, rounded half up to the poisha. */
export function percentOf(poisha: number, percent: string): number {
  const basisPoints = BigInt(toPoisha(percent)); // 12.5% → 1250
  if (basisPoints > BigInt(10000)) throw new RangeError(`Percent above 100: ${percent}`);
  // BigInt: the largest amount times 10,000 basis points is beyond a double's exact range.
  return Number((BigInt(poisha) * basisPoints + BigInt(5000)) / BigInt(10000));
}

export function sumPoisha(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** A whole number in words with the lakh and crore grouping used in Bangladesh: 3,50,000 → "three lakh fifty thousand". */
function wholeInWords(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${wholeInWords(crore)} crore`);
  let rest = n % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  rest %= 1000;
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** An amount for a receipt, e.g. "Three thousand five hundred taka only", "Twelve taka and fifty poisha only". */
export function takaInWords(poisha: number): string {
  const taka = Math.floor(poisha / 100);
  const paisa = poisha % 100;
  const text = paisa ? `${wholeInWords(taka)} taka and ${wholeInWords(paisa)} poisha only` : `${wholeInWords(taka)} taka only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
