import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { initialTagTokenColor, randomizeTagTokens } from '../scripts/tag-tokens';
import { createIslandTooltip } from '../scripts/island/tooltip';
import '../styles/tag-token.css';
import '../styles/tag-word-cloud.css';

type Tag = { name: string; count: number; href: string };
interface TagWordCloudProps { tags: Tag[]; }
type Word = { name: string; count: number; width: number; height: number };
type Placement = { x: number; y: number; width: number; height: number };
type Box = Placement & { name: string };
type CloudLayout = { height: number; width: number; positions: Record<string, Placement> };
type Point = { x: number; y: number } | null;
const magnification = (width: number) => width < 600 ? 1.3 : 1.9;

// Magic UI Dock's MotionValue → transform → spring composition, adapted to a
// two-dimensional cloud. See docs/tag-cloud-motion.md for source and license.
// The link remains a fixed hit target; only its non-interactive text scales.
function CloudWord({ tag, hidden, position, size, pointer, active, enabled, radius, growth }: {
  tag: Tag; hidden: boolean; position?: Placement; size: number;
  pointer: MotionValue<Point>; active: MotionValue<string | null>;
  enabled: boolean; radius: number; growth: number;
}) {
  const target = useTransform(() => {
    const point = pointer.get(), selected = active.get();
    if (!enabled || hidden) return 1;
    if (!position) return selected === tag.name ? 1 + growth : 1;
    if (!point) return 1;
    const distance = Math.hypot(point.x - position.x - position.width / 2,
      (point.y - position.y - position.height / 2) * 1.2);
    return distance < radius ? 1 + (1 + Math.cos(Math.PI * distance / radius)) / 2 * growth : 1;
  });
  const scale = useSpring(target, { mass: .2, stiffness: 180, damping: 18, restDelta: .001, restSpeed: .01 });
  return <li data-word={tag.name} hidden={hidden} style={position ? { position: 'absolute', left: position.x, top: position.y, width: position.width, height: position.height } : undefined}>
    <a className="tag-token tag-item" href={tag.href} data-count={tag.count} data-tag={tag.name.toLowerCase()} data-tag-token={tag.name} data-token-color={initialTagTokenColor(tag.name)} aria-label={`${tag.name}，${tag.count} 篇笔记`} style={{ '--tag-token-size': `${size}px` } as CSSProperties}>
      <motion.span className="tag-word" style={{ scale: enabled ? scale : 1 }}>{tag.name}</motion.span>
    </a>
  </li>;
}

/** Count controls both font size and distance from the center. Reserved space
 * lets neighboring words magnify without pushing the page layout around.
 * The links and their normal tab order stay in the same DOM throughout. */
function packWords(words: Word[], width: number): CloudLayout | null {
  if (!words.length || width < 1 || words.length > 160) return null;
  const spread = width < 600 ? 1.25 : 1.5, gap = width < 600 ? 8 : 12;
  const ranked = [...words].sort((a, b) => b.count - a.count || b.width - a.width || a.name.localeCompare(b.name));
  const min = Math.sqrt(Math.min(...ranked.map(word => word.count)));
  const max = Math.sqrt(Math.max(...ranked.map(word => word.count)));
  const area = ranked.reduce((sum, word) => sum + (word.width * spread + gap) * (word.height * spread + gap), 0);
  let height = Math.max(width < 600 ? 280 : 340, area / (width * .6));
  for (let pass = 0; pass < 4; pass++, height *= 1.2) {
    const placed: Box[] = [];
    for (const [index, word] of ranked.entries()) {
      const w = word.width * spread + gap, h = word.height * spread + gap;
      const weight = max > min ? (Math.sqrt(word.count) - min) / (max - min) : 1;
      const innerRadius = (1 - weight) * .52;
      let found = false;
      for (let step = 0; step < 2800; step++) {
        const angle = index * 2.39996 + step * .42;
        const radius = innerRadius + Math.sqrt(step / 2800) * .9;
        const x = (width - w) / 2 + Math.cos(angle) * radius * width / 2;
        const y = (height - h) / 2 + Math.sin(angle) * radius * height / 2;
        if (x < 8 || y < 8 || x + w > width - 8 || y + h > height - 8) continue;
        if (placed.some(box => x < box.x + box.width && x + w > box.x && y < box.y + box.height && y + h > box.y)) continue;
        placed.push({ name: word.name, width: w, height: h, x, y }); found = true; break;
      }
      if (!found) break;
    }
    if (placed.length === words.length) {
      const top = Math.min(...placed.map(word => word.y));
      const bottom = Math.max(...placed.map(word => word.y + word.height));
      return { width, height: Math.ceil(bottom - top + 32), positions: Object.fromEntries(placed.map(word => [word.name, { x: Math.round(word.x), y: Math.round(word.y - top + 16), width: word.width, height: word.height }])) };
    }
  }
  return null; // Natural, weighted wrapping remains usable for unusually long collections.
}

export default function TagWordCloud({ tags }: TagWordCloudProps) {
  const root = useRef<HTMLDivElement>(null);
  const cloud = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const tooltipId = useId();
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<CloudLayout | null>(null);
  const pointer = useMotionValue<Point>(null);
  const active = useMotionValue<string | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const normalized = query.trim().toLowerCase();
  const visibleCount = tags.filter(tag => tag.name.toLowerCase().includes(normalized)).length;
  const min = Math.sqrt(Math.min(...tags.map(tag => tag.count), Infinity));
  const max = Math.sqrt(Math.max(...tags.map(tag => tag.count), 0));
  const fontSize = (count: number) => max > min ? 14 + (Math.sqrt(count) - min) / (max - min) * 25 : 20;

  useEffect(() => {
    if (root.current) randomizeTagTokens(root.current);
    const restore = (event: PageTransitionEvent) => { if (event.persisted && root.current) randomizeTagTokens(root.current); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, [tags]);

  useEffect(() => {
    const element = cloud.current;
    if (!element) return;
    let frame = 0, active = true, previousWidth = 0;
    const measure = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active) return;
        const width = element.clientWidth;
        const words = [...element.querySelectorAll<HTMLLIElement>('li:not([hidden])')].map(item => {
          const link = item.querySelector('a')!, word = item.querySelector<HTMLElement>('.tag-word')!;
          // Measure the unscaled text once, never the reserved hit area.
          return { name: item.dataset.word!, count: Number(link.dataset.count), width: word.offsetWidth + 12,
            height: Math.max(word.offsetHeight + 8, matchMedia('(pointer: coarse)').matches ? 44 : 36) };
        });
        const next = packWords(words, width);
        setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      });
    };
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(width - previousWidth) > 1) { previousWidth = width; measure(); }
    });
    observer.observe(element);
    void document.fonts.ready.then(measure);
    measure();
    return () => { active = false; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [query, tags]);

  useEffect(() => {
    const host = root.current, element = cloud.current;
    if (!host || !element) return;
    const hint = createIslandTooltip(host, { id: `tag-cloud-hint-${tooltipId}` });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    let hovered: HTMLAnchorElement | null = null, focused: HTMLAnchorElement | null = null;
    let shown: HTMLAnchorElement | null = null, hideTimer = 0;
    const preference = () => setMotionEnabled(!reduced.matches && fine.matches);
    preference();

    function showHint(link: HTMLAnchorElement | null) {
      clearTimeout(hideTimer);
      if (!link) {
        // Crossing a small gap must not restart the tooltip's entrance.
        hideTimer = window.setTimeout(() => { hint.hide(); shown = null; }, 100);
        return;
      }
      active.set(link.parentElement!.dataset.word ?? null);
      if (shown === link) return;
      const rect = link.getBoundingClientRect(), bounds = host!.getBoundingClientRect();
      // Fixed link geometry anchors the tooltip; scaling text cannot move it.
      // Do not replay the shared popup animation when the count changes.
      hint.show(`${link.dataset.count} 篇笔记`, rect.left + rect.width / 2 - bounds.left, rect.top - bounds.top, true);
      shown = link;
    }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !fine.matches) return;
      const rect = element!.getBoundingClientRect();
      pointer.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      focused = null;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.tag-item') : null;
      if (hovered !== link) { hovered = link; active.set(link?.parentElement?.dataset.word ?? null); showHint(link); }
    }
    function leave() {
      hovered = null;
      if (!focused) { pointer.set(null); active.set(null); showHint(null); }
    }
    function focus(event: FocusEvent) {
      const link = event.target;
      if (!(link instanceof HTMLAnchorElement) || !link.matches('.tag-item:focus-visible')) return;
      focused = link; hovered = null;
      const item = link.parentElement!;
      pointer.set({ x: item.offsetLeft + item.offsetWidth / 2, y: item.offsetTop + item.offsetHeight / 2 });
      showHint(link);
    }
    function blur() { focused = null; if (!hovered) { pointer.set(null); active.set(null); showHint(null); } }
    // Native links handle click, touch, Tab and Enter. No directional-key mode.
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    reduced.addEventListener('change', preference);
    fine.addEventListener('change', preference);
    return () => {
      clearTimeout(hideTimer); hint.dispose(); pointer.set(null); active.set(null);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      reduced.removeEventListener('change', preference);
      fine.removeEventListener('change', preference);
    };
  }, [layout, query, tags, tooltipId, pointer, active]);

  return (
    <div className="tag-cloud-content" ref={root}>
      {tags.length > 0 && <div className="tag-tools">
        <label className="tag-search">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input id="tag-filter" ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选标签…" aria-label="筛选标签" />
        </label>
        <p id="tag-count" className="sr-only" role="status" aria-live="polite">{normalized ? `找到 ${visibleCount} 个标签` : `${tags.length} 个标签`}</p>
      </div>}
      <ul className="tag-word-cloud" aria-label="标签词云" ref={cloud} hidden={visibleCount === 0} data-packed={Boolean(layout)} style={layout ? { height: layout.height } : undefined}>
        {tags.map(tag => <CloudWord key={tag.name} tag={tag} hidden={!tag.name.toLowerCase().includes(normalized)}
          position={layout?.positions[tag.name]} size={fontSize(tag.count)} pointer={pointer} active={active}
          enabled={motionEnabled} radius={Math.min(220, Math.max(150, (layout?.width ?? 800) * .25))}
          growth={magnification(layout?.width ?? 800) - 1} />)}
      </ul>
      {visibleCount === 0 && <div id="tag-empty" className="tag-cloud-empty">
        <p>{tags.length ? '没有匹配的标签。换个关键词，再找找看。' : '标签还在慢慢收集，先翻开一篇笔记吧。'}</p>
        {tags.length ? <button id="tag-reset" type="button" className="blog-button" onClick={() => { setQuery(''); search.current?.focus(); }}>清空筛选</button> : <a className="blog-button" href="/notes/">翻开笔记</a>}
      </div>}
    </div>
  );
}
