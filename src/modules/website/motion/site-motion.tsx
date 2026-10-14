"use client";

import { useEffect } from "react";
import { bnDigits } from "../i18n";

// The website's scroll and pointer effects (D137), set up once after the page loads, on the server-rendered markup:
// - sections and their cards rise into view as the visitor scrolls (content is never hidden before this runs);
// - stats count up from zero when they come into view;
// - the header gains a shadow once the page scrolls;
// - cards tilt in 3D under a mouse pointer, with a glare, and the banner's 3D shapes follow the pointer;
// - the phone menu closes when a link in it is tapped.
// A visitor who asks for less motion gets the page as it is, with only the menu behaviour.

const REVEAL_CHILDREN = ".site-section > div > *";
const REVEAL_ITEMS = ".site-section :is(ul, ol) > li, .site-section .grid > article";
const TILT = ".site-section :is(li, article).site-card, .site-section li > figure.site-card";
const MAX_TILT = 7;

export function SiteMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-website]");
    if (!root) return;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener));
    };

    // The phone menu closes after a link is chosen.
    on(root, "click", (e) => {
      const link = (e.target as HTMLElement).closest("details a");
      link?.closest("details")?.removeAttribute("open");
    });

    // The header's shadow once scrolled.
    const onScroll = () => root.toggleAttribute("data-scrolled", window.scrollY > 8);
    onScroll();
    on(window, "scroll", onScroll, { passive: true });

    // Old browsers without these simply keep the page as it is.
    const capable = typeof window.matchMedia === "function" && "IntersectionObserver" in window;
    if (!capable || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => cleanups.forEach((c) => c());

    // Reveal: mark the pieces, show at once what is already on screen, then switch the effect on.
    // A list whose items rise one by one doesn't also fade in as a whole.
    const blocks = [...root.querySelectorAll<HTMLElement>(REVEAL_CHILDREN)].filter((el) => !el.matches("ul, ol") && !el.querySelector(":scope > article"));
    const pieces = new Set<HTMLElement>([...blocks, ...root.querySelectorAll<HTMLElement>(REVEAL_ITEMS)]);
    for (const el of pieces) {
      el.setAttribute("data-reveal", "");
      const siblings = el.parentElement ? [...el.parentElement.children] : [];
      el.style.setProperty("--reveal-i", String(Math.min(siblings.indexOf(el), 8)));
      if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute("data-shown", "");
    }
    root.setAttribute("data-motion", "on");

    const lang = root.getAttribute("lang");
    const format = (n: number) => (lang === "bn" ? bnDigits(n.toLocaleString("en-US")) : n.toLocaleString("en-US"));
    const countUp = (el: HTMLElement) => {
      const to = Number(el.dataset.countTo);
      if (!Number.isFinite(to) || el.dataset.counted) return;
      el.dataset.counted = "1";
      // A plain frame-by-frame tween (ease-out), so the count-up needs no animation engine.
      const start = performance.now();
      let frame = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 1800);
        el.textContent = format(Math.round(to * (1 - (1 - p) ** 4)));
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      cleanups.push(() => cancelAnimationFrame(frame));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.setAttribute("data-shown", "");
          el.querySelectorAll<HTMLElement>("[data-count-to]").forEach(countUp);
          if (el.dataset.countTo) countUp(el);
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    pieces.forEach((el) => observer.observe(el));
    root.querySelectorAll<HTMLElement>("[data-count-to]").forEach((el) => observer.observe(el));
    cleanups.push(() => observer.disconnect());

    // Tilt and the banner's shapes follow a mouse pointer; touch screens keep them still.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const cards = [...root.querySelectorAll<HTMLElement>(TILT)];
      for (const card of cards) {
        card.setAttribute("data-tilt", "");
        on(card, "pointermove", (e) => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          card.style.transition = "transform 0.12s ease-out";
          card.style.transitionDelay = "0s";
          card.style.transform = `perspective(900px) rotateX(${((0.5 - y) * MAX_TILT * 2).toFixed(2)}deg) rotateY(${((x - 0.5) * MAX_TILT * 2).toFixed(2)}deg) translateZ(0)`;
          card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
          card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
          card.setAttribute("data-tilting", "");
        });
        on(card, "pointerleave", () => {
          card.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
          card.style.transform = "";
          card.removeAttribute("data-tilting");
        });
      }
      const hero = root.querySelector<HTMLElement>("section[aria-label='Welcome']");
      if (hero) {
        on(hero, "pointermove", (e) => {
          const r = hero.getBoundingClientRect();
          hero.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
          hero.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        });
        on(hero, "pointerleave", () => {
          hero.style.setProperty("--px", "0");
          hero.style.setProperty("--py", "0");
        });
      }
    }

    return () => cleanups.forEach((c) => c());
  }, []);
  return null;
}
