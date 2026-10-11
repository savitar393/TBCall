"use client";
import { useEffect, useState, type RefObject } from "react";

// Only the public page uses these presentation effects. Pending content is always readable.
export function usePublicInteractions(root: RefObject<HTMLElement | null>) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let compact = false;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = compact ? window.scrollY > 16 : window.scrollY >= 40;
      if (next !== compact) { compact = next; setScrolled(next); }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => { window.removeEventListener("scroll", schedule); if (frame !== null) cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const targets = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-reveal]") ?? []);
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const showImmediately = () => { observer?.disconnect(); targets.forEach(target => { target.dataset.revealed = "static"; }); };
    if (media?.matches || typeof IntersectionObserver === "undefined") { showImmediately(); return; }
    try {
      observer = new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
          const element = target as HTMLElement;
          if (!isIntersecting || element.dataset.revealed) return;
          element.dataset.revealed = element.contains(document.activeElement) ? "static" : "visible";
          observer?.unobserve(element);
        });
      }, { threshold: 0.08 });
      targets.forEach(target => observer?.observe(target));
    } catch { showImmediately(); }
    const change = (event: MediaQueryListEvent) => { if (event.matches) showImmediately(); };
    media?.addEventListener?.("change", change);
    return () => { observer?.disconnect(); media?.removeEventListener?.("change", change); };
  }, [root]);
  return scrolled;
}
