"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Site-wide scroll motion (referensi/recon-ui/MOTION.txt): sections fade up out of a blur once in view, like the reference's
 * appear effects. Loops (light streak, marquee, accordion rule, hero deal mock) are CSS keyframes in globals.css.
 * Everything is visible by default: hidden start states apply only under html.motion, which MOTION_BOOT sets before paint
 * (and removes again if this script never starts). With prefers-reduced-motion nothing moves.
 *
 *  [data-reveal]   fades up 18 px out of a 6 px blur once in view (adds .in); --delay staggers siblings
 *  [data-grow]     a hairline that draws from the left once in view
 *  AUTO            panels on app pages are tagged as reveals so pages need no wrappers
 */

const AUTO = ["main .panel", "main .dealcard", "main .panel-line"].join(",");

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    (window as unknown as { __svMotion?: boolean }).__svMotion = true;
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("motion");
      return;
    }
    root.classList.add("motion");

    const vh = () => window.innerHeight || 800;
    document.querySelectorAll<HTMLElement>(AUTO).forEach((el) => {
      if (el.hasAttribute("data-reveal") || el.closest("[data-reveal]")) return;
      if (el.getBoundingClientRect().top < vh()) return;
      el.setAttribute("data-reveal", "auto");
    });

    const io = new IntersectionObserver(
      (entries) => {
        let k = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          if (el.dataset.reveal === "auto") el.style.setProperty("--delay", `${Math.min(k++, 5) * 70}ms`);
          el.classList.add("in");
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    const SEL = "[data-reveal],[data-grow]";
    const watched = new WeakSet<Element>();
    const observe = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        io.observe(el);
      });
    };
    observe(document);
    const mo = new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) {
            if (n.matches(SEL) && !watched.has(n)) {
              watched.add(n);
              io.observe(n);
            }
            observe(n);
          }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // A hidden tab may never deliver intersection callbacks: show everything when the page is hidden.
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      document.querySelectorAll<HTMLElement>(SEL).forEach((el) => el.classList.add("in"));
      // Hidden tabs freeze CSS animations at their first frame: drop the load sequence so nothing stays invisible.
      root.classList.add("still");
    };
    document.addEventListener("visibilitychange", onHide);
    onHide();
    return () => {
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [path]);

  return null;
}
