import { Hind_Siliguri, Merriweather, Playfair_Display, Poppins } from "next/font/google";
import type { WebsiteFont } from "./options";

// Heading fonts for the public website (D124). Self-hosted by next/font; only the public site loads them.

const poppins = Poppins({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["700"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["700"], display: "swap" });
const hindSiliguri = Hind_Siliguri({ subsets: ["latin", "bengali"], weight: ["600", "700"], display: "swap" });

export const HEADING_FONT_FAMILY: Record<WebsiteFont, string> = {
  INTER: "var(--font-inter), var(--font-noto-bengali), sans-serif",
  POPPINS: poppins.style.fontFamily,
  MERRIWEATHER: merriweather.style.fontFamily,
  PLAYFAIR: playfair.style.fontFamily,
  HIND_SILIGURI: hindSiliguri.style.fontFamily,
};
