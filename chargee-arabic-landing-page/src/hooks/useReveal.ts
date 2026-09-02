import { useEffect, useRef } from "react";

/**
 * Attaches an IntersectionObserver to elements with the `.reveal` class
 * inside the returned ref, toggling `.is-visible` with a staggered delay
 * based on the `data-reveal-index` attribute.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const items = root.matches(".reveal") ? [root] : Array.from(root.querySelectorAll<HTMLElement>(".reveal"));

    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const index = Number(el.dataset.revealIndex ?? 0);
            el.style.transitionDelay = `${Math.min(index * 90, 540)}ms`;
            el.classList.add("is-visible");
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  return containerRef;
}
