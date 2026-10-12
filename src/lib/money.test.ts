import { describe, expect, it } from "vitest";
import { MAX_POISHA, formatTaka, fromPoisha, isAmountText, percentOf, sumPoisha, takaInWords, toPoisha } from "./money";

describe("money", () => {
  it("reads taka strings into poisha without floating point", () => {
    expect(toPoisha("2000")).toBe(200000);
    expect(toPoisha("2000.5")).toBe(200050);
    expect(toPoisha("0.29")).toBe(29);
    expect(toPoisha(" 9999999999.99 ")).toBe(MAX_POISHA);
  });

  it("refuses anything that isn't a plain amount", () => {
    for (const bad of ["", "-5", "1.234", "1e3", "abc", "12,000", "10000000000"]) {
      expect(isAmountText(bad), bad).toBe(false);
      expect(() => toPoisha(bad), bad).toThrow(RangeError);
    }
  });

  it("writes poisha back as the database's taka string", () => {
    expect(fromPoisha(200050)).toBe("2000.50");
    expect(fromPoisha(29)).toBe("0.29");
    expect(fromPoisha(0)).toBe("0.00");
    expect(fromPoisha(-150)).toBe("-1.50");
    expect(() => fromPoisha(1.5)).toThrow(RangeError);
  });

  it("formats with Bangladeshi grouping", () => {
    expect(formatTaka(200000)).toBe("৳2,000.00");
    expect(formatTaka(1234567890)).toBe("৳1,23,45,678.90");
    expect(formatTaka(-30000)).toBe("−৳300.00");
  });

  it("takes a percentage rounded half up to the poisha", () => {
    expect(percentOf(200000, "10")).toBe(20000);
    expect(percentOf(333, "50")).toBe(167); // 166.5 rounds up
    expect(percentOf(100, "12.5")).toBe(13); // 12.5 rounds up
    expect(percentOf(MAX_POISHA, "100")).toBe(MAX_POISHA);
    expect(() => percentOf(100, "100.01")).toThrow(RangeError);
  });

  it("never drifts when summing many small amounts", () => {
    const parts = Array.from({ length: 1000 }, () => toPoisha("0.10"));
    expect(sumPoisha(parts)).toBe(10000);
    expect(fromPoisha(sumPoisha(parts))).toBe("100.00");
  });
});

describe("takaInWords", () => {
  it("writes amounts the way a Bangladeshi receipt does", () => {
    expect(takaInWords(350000)).toBe("Three thousand five hundred taka only");
    expect(takaInWords(35000000)).toBe("Three lakh fifty thousand taka only");
    expect(takaInWords(1250000050)).toBe("One crore twenty-five lakh taka and fifty poisha only");
    expect(takaInWords(1205)).toBe("Twelve taka and five poisha only");
    expect(takaInWords(10000)).toBe("One hundred taka only");
  });
});
