// Excludes l, I, O, 0 and 1, which are easily misread.
const LETTERS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LETTERS + DIGITS;

function pick(alphabet: string, random: number): string {
  return alphabet[random % alphabet.length];
}

/** Always contains a letter and a digit, so it always satisfies the password rule. */
export function generateTemporaryPassword(length = 12): string {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);

  const chars = Array.from(random, (r) => pick(ALL, r));
  const letterAt = random[0] % length;
  const digitAt = (letterAt + 1 + (random[1] % (length - 1))) % length;
  chars[letterAt] = pick(LETTERS, random[2]);
  chars[digitAt] = pick(DIGITS, random[3]);
  return chars.join("");
}
