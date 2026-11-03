import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import RainGlassBackground from '@/components/kokonutui/rain-glass-background';
import { SITE } from '@/data/site';
import { buildId } from '../../public/room/materials/manifest.json';

interface LofiHeroProps {
  tagline: string;
  intro: string;
  /** Magazine Lo-fi wordmark. Passed from Astro as `<Brand size="hero" />`. */
  title?: ReactNode;
}

export default function LofiHero({ tagline, intro, title }: LofiHeroProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="lofi-hero relative isolate">
        <RainGlassBackground
          src={`/room/reading.jpg?v=${buildId}`}
          title={title}
          rain={0.35}
          className="min-h-[100dvh] rounded-none border-0 text-hero-fg shadow-none"
          contentClassName="min-h-[100dvh]"
          titleClassName="max-w-none font-sans text-base font-normal tracking-normal sm:text-base"
        >
          <div className="flex max-w-2xl flex-col items-center gap-5">
            <p className="max-w-xl text-balance font-sans text-lg leading-8 tracking-wide text-hero-fg sm:text-xl">
              {tagline}
            </p>
            <p className="max-w-lg text-balance text-sm leading-7 text-hero-muted">{intro}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <a
                href="#magazine-start"
                className="rounded-md bg-accent-soft px-5 py-2.5 text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:bg-[#e5b978]"
              >
                开始阅读 <span aria-hidden="true">↓</span>
              </a>
              <a
                href="/"
                className="rounded-md border border-hero-fg/35 bg-black/10 px-5 py-2.5 text-sm font-medium text-hero-fg transition-colors hover:border-accent-soft/70 hover:bg-black/20"
              >
                回到书房 <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-hero-muted">
              {SITE.title.toUpperCase()} / 实践志
            </p>
          </div>
        </RainGlassBackground>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-b from-transparent to-paper sm:h-24 dark:to-night"
        />
      </div>
    </MotionConfig>
  );
}
