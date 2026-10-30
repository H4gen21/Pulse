'use client';
import { useEffect } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds `.in` to `.reveal` elements as they scroll into view (instantly with reduced motion). */
export function RevealObserver() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.reveal:not(.in)')];
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('in');
          obs.unobserve(en.target);
        }
      },
      { threshold: 0.12 },
    );
    els.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  return null;
}
