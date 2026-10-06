"use client";
import { useEffect, useState } from "react";

const LINKS: Array<[string, string]> = [
  ["Home", "#top"],
  ["Product", "#product"],
  ["How it works", "#how"],
  ["Security", "#security"],
  ["FAQ", "#faq"],
];

export function ScrollSpyNav({ mobile = false }: { mobile?: boolean }) {
  const [current, setCurrent] = useState("#home");

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY < 160) setCurrent("#home");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const sections = LINKS.filter(([, h]) => h !== "#top")
      .map(([, h]) => document.getElementById(h.slice(1)))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) {
      return () => window.removeEventListener("scroll", onScroll);
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(`#${e.target.id}`);
        }
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    sections.forEach((s) => obs.observe(s));
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (mobile) {
    const items: Array<[string, string]> = [
      ["Home", "#top"],
      ["Product", "#product"],
      ["How it works", "#how"],
      ["FAQ", "#faq"],
    ];
    return (
      <nav className="mx-auto hidden items-center gap-4 text-[13px] font-semibold md:flex lg:hidden">
        {items.map(([t, h]) => (
          <a key={t} href={h} aria-current={current === h ? "true" : undefined} className={`nav-link${current === h ? " current" : ""}`}>
            {t}
          </a>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className="mx-auto hidden items-center gap-1 rounded-full border p-1 text-[13px] font-semibold lg:flex"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      {LINKS.map(([t, h]) => (
        <a
          key={t}
          href={h}
          aria-current={current === h ? "true" : undefined}
          className={`nav-pill px-4 py-2${current === h ? " current" : ""}`}
        >
          {t}
        </a>
      ))}
    </nav>
  );
}
