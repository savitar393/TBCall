import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LandingPage } from "@/features/public/landing";
let scroll = 0;
let frames: FrameRequestCallback[];
let reduced = false;
let preferenceChange: ((event: MediaQueryListEvent) => void) | undefined;
let observations: { callback: IntersectionObserverCallback; targets: Set<Element> }[];
beforeEach(() => {
  scroll = 0; frames = []; observations = []; reduced = false;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: (_: string, callback: typeof preferenceChange) => { preferenceChange = callback; }, removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class {
    targets = new Set<Element>();
    constructor(callback: IntersectionObserverCallback) { observations.push({ callback, targets: this.targets }); }
    observe = (element: Element) => { this.targets.add(element); };
    unobserve = (element: Element) => { this.targets.delete(element); };
    disconnect = () => { this.targets.clear(); };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); preferenceChange = undefined; });
function scrollTo(y: number) { act(() => { scroll = y; fireEvent.scroll(window); const queued = frames.splice(0); queued.forEach(callback => callback(0)); }); }
function intersect(element: Element, visible = true) { act(() => { observations[0].callback([{ target: element, isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver); }); }
it("keeps the header at top and uses hysteresis before compacting or returning", () => {
  render(<LandingPage/>); const header = screen.getByRole("banner");
  expect(header).toHaveAttribute("data-scrolled", "false");
  scrollTo(48); expect(header).toHaveAttribute("data-scrolled", "true");
  scrollTo(30); expect(header).toHaveAttribute("data-scrolled", "true");
  scrollTo(10); expect(header).toHaveAttribute("data-scrolled", "false");
  scrollTo(30); expect(header).toHaveAttribute("data-scrolled", "false");
});
it("reveals each target once and keeps it revealed after leaving and reentering", () => {
  const { container } = render(<LandingPage/>); const target = container.querySelector('[data-reveal]')!;
  expect(target).not.toBeNull(); expect(target).not.toHaveAttribute("aria-hidden", "true");
  expect(target).not.toHaveAttribute("data-revealed");
  intersect(target); expect(target).toHaveAttribute("data-revealed", "visible");
  expect(observations[0].targets.has(target)).toBe(false);
  intersect(target, false); intersect(target); expect(target).toHaveAttribute("data-revealed", "visible");
});
it("keeps all content available without observers", () => {
  vi.stubGlobal("IntersectionObserver", undefined); const { container } = render(<LandingPage/>);
  const targets = container.querySelectorAll('[data-reveal]'); expect(targets.length).toBeGreaterThan(5);
  targets.forEach(target => expect(target).toHaveAttribute("data-revealed", "static"));
  expect(screen.getByRole("heading", { name: "Satu tempat untuk langkah berikutnya." })).toBeVisible();
});
it("shows reduced-motion content immediately without creating an observer", () => {
  reduced = true; const { container } = render(<LandingPage/>); expect(observations).toHaveLength(0);
  const targets = container.querySelectorAll('[data-reveal]'); expect(targets.length).toBeGreaterThan(5);
  targets.forEach(target => expect(target).toHaveAttribute("data-revealed", "static"));
});
it("releases pending animations when reduced motion becomes enabled", () => {
  const { container } = render(<LandingPage/>); act(() => preferenceChange?.({ matches: true } as MediaQueryListEvent));
  const targets = container.querySelectorAll('[data-reveal]'); expect(targets.length).toBeGreaterThan(5);
  targets.forEach(target => expect(target).toHaveAttribute("data-revealed", "static")); expect(observations[0].targets.size).toBe(0);
});
it("server markup contains readable sections without animation-dependent visibility", () => {
  const html = renderToString(<LandingPage/>); expect(html).toContain('data-reveal'); expect(html).not.toContain('data-revealed=');
  expect(html).not.toMatch(/opacity:\s*0|visibility:\s*hidden/); expect(html).toContain("TBC dalam catatan Jawa Tengah.");
});
it("retains accessible mobile anchors and closes the menu after selection", async () => {
  render(<LandingPage/>); const toggle = screen.getByRole("button", { name: "Buka menu" }); await userEvent.click(toggle);
  const nav = screen.getByRole("navigation", { name: "Navigasi publik seluler" }); const link = within(nav).getByRole("link", { name: "Data TBC" });
  expect(link).toHaveAttribute("href", "#statistik"); await userEvent.click(link); expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "Navigasi publik seluler" })).not.toBeInTheDocument();
});
it("disconnects observers and cancels scroll work on unmount", () => {
  const { unmount } = render(<LandingPage/>); fireEvent.scroll(window); unmount();
  expect(observations[0].targets.size).toBe(0); expect(cancelAnimationFrame).toHaveBeenCalled();
});
it("keeps a focused target static instead of moving keyboard focus during reveal", () => {
  const { container } = render(<LandingPage/>);
  const target = container.querySelector('[data-reveal]')!;
  (target.querySelector('a') as HTMLElement).focus(); intersect(target);
  expect(target).toHaveAttribute("data-revealed", "static");
});
it("keeps content readable if the observer constructor is unsupported at runtime", () => {
  vi.stubGlobal("IntersectionObserver", class { constructor() { throw new Error('unsupported'); } });
  const { container } = render(<LandingPage/>);
  const targets = container.querySelectorAll('[data-reveal]'); expect(targets.length).toBeGreaterThan(5);
  targets.forEach(target => expect(target).toHaveAttribute("data-revealed", "static"));
});
