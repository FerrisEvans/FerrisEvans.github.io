import { MotionConfig } from 'motion/react';
import RainGlassBackground from '@/components/kokonutui/rain-glass-background';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { buildId } from '../../public/room/materials/manifest.json';

interface LofiHeroProps {
  tagline: string;
  intro: string;
}

export default function LofiHero({ tagline, intro }: LofiHeroProps) {
  return (
    <MotionConfig reducedMotion="user">
      <RainGlassBackground
        src={`/room/reading.jpg?v=${buildId}`}
        title={
          <TextEffect as="span" initial={false} per="char" preset="fade-in-blur" speedReveal={0.65} speedSegment={1.4}>
            Mainloop
          </TextEffect>
        }
        rain={0.35}
        className="rounded-2xl border border-[#6b543b]/50 text-[#f3ead8] shadow-[0_28px_80px_-42px_rgba(0,0,0,0.8)]"
      >
        <div className="flex max-w-2xl flex-col items-center gap-5">
          <p className="max-w-xl text-balance font-serif text-lg leading-8 text-[#e6dbc7] sm:text-xl">
            {tagline}
          </p>
          <p className="max-w-lg text-balance text-sm leading-7 text-[#c6b9a3]">{intro}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <a
              href="#latest-heading"
              className="rounded-md bg-[#d6a45f] px-5 py-2.5 text-sm font-semibold text-[#211b14] transition-all hover:-translate-y-0.5 hover:bg-[#e5b978]"
            >
              开始阅读 <span aria-hidden="true">↓</span>
            </a>
            <a
              href="/"
              className="rounded-md border border-[#d6c6a8]/35 bg-black/10 px-5 py-2.5 text-sm font-medium text-[#eee2cc] transition-colors hover:border-[#d6a45f]/60 hover:bg-black/20"
            >
              回到书房 <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-[#a99b85]">
            MAINLOOP / PERSONAL NOTES
          </p>
        </div>
      </RainGlassBackground>
    </MotionConfig>
  );
}
