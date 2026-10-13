import {
  Anek_Bangla, Baloo_Da_2, DM_Serif_Display, Hind_Siliguri, Lato, Lora, Merriweather, Montserrat, Noto_Serif_Bengali, Nunito, Oswald, Outfit, Playfair_Display,
  Poppins, Raleway, Space_Grotesk, Tiro_Bangla,
} from "next/font/google";
import type { WebsiteFont } from "@/server/modules/website/design";

// Fonts for the public website (D124, D135). Self-hosted by next/font and only the public site imports them. Nothing is
// preloaded: a browser downloads only the faces the institute's chosen fonts actually use. Every stack ends with the
// app's Bengali font, so Bangla text is always shaped correctly.

const poppins = Poppins({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "600", "700"] });
const merriweather = Merriweather({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "700"] });
const playfair = Playfair_Display({ display: "swap", preload: false, subsets: ["latin"], weight: ["700"] });
const hindSiliguri = Hind_Siliguri({ display: "swap", preload: false, subsets: ["latin", "bengali"], weight: ["400", "600", "700"] });
const montserrat = Montserrat({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "600", "800"] });
const lato = Lato({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "700"] });
const nunito = Nunito({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "700", "800"] });
const raleway = Raleway({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "600", "700"] });
const outfit = Outfit({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ display: "swap", preload: false, subsets: ["latin"], weight: ["500", "700"] });
const lora = Lora({ display: "swap", preload: false, subsets: ["latin"], weight: ["400", "700"] });
const dmSerif = DM_Serif_Display({ display: "swap", preload: false, subsets: ["latin"], weight: ["400"] });
const oswald = Oswald({ display: "swap", preload: false, subsets: ["latin"], weight: ["500", "700"] });
const notoSerifBengali = Noto_Serif_Bengali({ display: "swap", preload: false, subsets: ["latin", "bengali"], weight: ["400", "700"] });
const tiroBangla = Tiro_Bangla({ display: "swap", preload: false, subsets: ["latin", "bengali"], weight: ["400"] });
const balooDa = Baloo_Da_2({ display: "swap", preload: false, subsets: ["latin", "bengali"], weight: ["500", "700"] });
const anekBangla = Anek_Bangla({ display: "swap", preload: false, subsets: ["latin", "bengali"], weight: ["400", "600", "700"] });

const BENGALI_FALLBACK = "var(--font-noto-bengali), sans-serif";

export const FONT_FAMILY: Record<WebsiteFont, string> = {
  INTER: `var(--font-inter), ${BENGALI_FALLBACK}`,
  POPPINS: `${poppins.style.fontFamily}, ${BENGALI_FALLBACK}`,
  MERRIWEATHER: `${merriweather.style.fontFamily}, ${BENGALI_FALLBACK}`,
  PLAYFAIR: `${playfair.style.fontFamily}, ${BENGALI_FALLBACK}`,
  HIND_SILIGURI: `${hindSiliguri.style.fontFamily}, ${BENGALI_FALLBACK}`,
  MONTSERRAT: `${montserrat.style.fontFamily}, ${BENGALI_FALLBACK}`,
  LATO: `${lato.style.fontFamily}, ${BENGALI_FALLBACK}`,
  NUNITO: `${nunito.style.fontFamily}, ${BENGALI_FALLBACK}`,
  RALEWAY: `${raleway.style.fontFamily}, ${BENGALI_FALLBACK}`,
  OUTFIT: `${outfit.style.fontFamily}, ${BENGALI_FALLBACK}`,
  SPACE_GROTESK: `${spaceGrotesk.style.fontFamily}, ${BENGALI_FALLBACK}`,
  LORA: `${lora.style.fontFamily}, ${BENGALI_FALLBACK}`,
  DM_SERIF_DISPLAY: `${dmSerif.style.fontFamily}, ${BENGALI_FALLBACK}`,
  OSWALD: `${oswald.style.fontFamily}, ${BENGALI_FALLBACK}`,
  NOTO_SERIF_BENGALI: `${notoSerifBengali.style.fontFamily}, ${BENGALI_FALLBACK}`,
  TIRO_BANGLA: `${tiroBangla.style.fontFamily}, ${BENGALI_FALLBACK}`,
  BALOO_DA_2: `${balooDa.style.fontFamily}, ${BENGALI_FALLBACK}`,
  ANEK_BANGLA: `${anekBangla.style.fontFamily}, ${BENGALI_FALLBACK}`,
};
