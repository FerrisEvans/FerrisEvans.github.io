import { type Locale, t, localizePath } from '../i18n';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { initialTagTokenColor, randomizeTagTokens } from '../scripts/tag-tokens';
import { createIslandTooltip } from '../scripts/island/tooltip';
import { solveAvoidance } from '../scripts/tag-cloud-avoidance';
import '../styles/tag-token.css';
import '../styles/tag-word-cloud.css';

type Tag = { name: string; count: number; href: string };
interface TagWordCloudProps { tags: Tag[]; locale: Locale; }
type Word = { name: string; count: number; width: number; height: number; textWidth: number; textHeight: number };
type Placement = { x: number; y: number; width: number; height: number; textWidth: number; textHeight: number };
type Box = Placement & { name: string };
type CloudLayout = { height: number; width: number; positions: Record<string, Placement> };
type Point = { x: number; y: number } | null;
type Selection = { id: string; x: number; y: number } | null;
type WordMotion = { x: number; y: number; scale: number };
type LiveWords = Map<string, { x: MotionValue<number>; y: MotionValue<number>; scale: MotionValue<number> }>;
const magnification = (width: number) => width < 600 ? 1.3 : 1.9;
const spring = { mass: .2, stiffness: 180, damping: 18, restDelta: .001, restSpeed: .01 };

// Magic UI Dock's MotionValue → transform → spring composition, adapted to a
// two-dimensional cloud. Source:
// https://github.com/magicuidesign/magicui/blob/58ee1feebc504a660c00087b369da511e913477e/apps/www/registry/magicui/dock.tsx
// MIT license: public/vendor/magic-ui/LICENSE.txt.
// Native links move with their text; the selected word pins its current offset.
function CloudWord({ locale, tag, hidden, position, size, plan, active, enabled, live }: {
  locale: Locale; tag: Tag; hidden: boolean; position?: Placement; size: number;
  plan: MotionValue<Record<string, WordMotion>>; active: MotionValue<Selection>;
  enabled: boolean; live: LiveWords;
}) {
  const scaleTarget = useTransform(plan, value => value[tag.name]?.scale ?? 1);
  const xTarget = useTransform(plan, value => value[tag.name]?.x ?? 0);
  const yTarget = useTransform(plan, value => value[tag.name]?.y ?? 0);
  const scale = useSpring(scaleTarget, spring), x = useSpring(xTarget, spring), y = useSpring(yTarget, spring);
  const zIndex = useTransform(active, value => value?.id === tag.name ? 2 : 0);
  useEffect(() => {
    live.set(tag.name, { x, y, scale });
    const unsubscribe = active.on('change', selected => {
      // Stop residual spring velocity when a moving neighbor becomes selected.
      if (selected?.id === tag.name) { x.jump(selected.x); y.jump(selected.y); }
    });
    return () => { unsubscribe(); live.delete(tag.name); };
  }, [tag.name, live, active, x, y, scale]);
  return <motion.li data-word={tag.name} hidden={hidden} style={{ ...(position ? { position: 'absolute', left: position.x, top: position.y, width: position.width, height: position.height } : {}), x: enabled ? x : 0, y: enabled ? y : 0, zIndex }}>
    <a className="tag-token tag-item" href={tag.href} data-count={tag.count} data-tag={tag.name.toLowerCase()} data-tag-token={tag.name} data-token-color={initialTagTokenColor(tag.name)} aria-label={t(locale, `${tag.name}，${tag.count} 篇笔记`, `${tag.name}, ${tag.count} ${tag.count === 1 ? "note" : "notes"}`)} style={{ '--tag-token-size': `${size}px` } as CSSProperties}>
      <motion.span className="tag-word" style={{ scale: enabled ? scale : 1 }}>{tag.name}</motion.span>
    </a>
  </motion.li>;
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
        placed.push({ name: word.name, width: w, height: h, x, y, textWidth: word.textWidth, textHeight: word.textHeight }); found = true; break;
      }
      if (!found) break;
    }
    if (placed.length === words.length) {
      const top = Math.min(...placed.map(word => word.y));
      const bottom = Math.max(...placed.map(word => word.y + word.height));
      return { width, height: Math.ceil(bottom - top + 32), positions: Object.fromEntries(placed.map(word => [word.name, { x: Math.round(word.x), y: Math.round(word.y - top + 16), width: word.width, height: word.height, textWidth: word.textWidth, textHeight: word.textHeight }])) };
    }
  }
  return null; // Natural, weighted wrapping remains usable for unusually long collections.
}

export default function TagWordCloud({ tags, locale }: TagWordCloudProps) {
  const root = useRef<HTMLDivElement>(null);
  const cloud = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const tooltipId = useId();
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<CloudLayout | null>(null);
  const pointer = useMotionValue<Point>(null);
  const active = useMotionValue<Selection>(null);
  const live = useRef<LiveWords>(new Map());
  const [motionEnabled, setMotionEnabled] = useState(false);
  const normalized = query.trim().toLowerCase();
  const visibleCount = tags.filter(tag => tag.name.toLowerCase().includes(normalized)).length;
  const min = Math.sqrt(Math.min(...tags.map(tag => tag.count), Infinity));
  const max = Math.sqrt(Math.max(...tags.map(tag => tag.count), 0));
  const fontSize = (count: number) => max > min ? 14 + (Math.sqrt(count) - min) / (max - min) * 25 : 20;
  const plan = useTransform((): Record<string, WordMotion> => {
    const point = pointer.get(), selected = active.get();
    if (!motionEnabled || !point) return {};
    const radius = Math.min(220, Math.max(150, (layout?.width ?? 800) * .25));
    const growth = magnification(layout?.width ?? 800) - 1;
    if (!layout) return selected ? { [selected.id]: { x: 0, y: 0, scale: 1 + growth } } : {};
    const items = Object.entries(layout.positions).map(([id, p]) => {
      const x = p.x + p.width / 2 + (selected?.id === id ? selected.x : 0);
      const y = p.y + p.height / 2 + (selected?.id === id ? selected.y : 0);
      const distance = Math.hypot(point.x - x, (point.y - y) * 1.2);
      return { id, x, y, width: p.textWidth, height: p.textHeight,
        scale: distance < radius ? 1 + (1 + Math.cos(Math.PI * distance / radius)) / 2 * growth : 1 };
    });
    const offsets = solveAvoidance(items, selected?.id ?? null, layout);
    return Object.fromEntries(items.map(item => {
      const p = layout.positions[item.id], offset = offsets[item.id];
      return [item.id, { scale: item.scale,
        x: selected?.id === item.id ? selected.x : Math.max(-p.x, Math.min(layout.width - p.x - p.width, offset?.x ?? 0)),
        y: selected?.id === item.id ? selected.y : Math.max(-p.y, Math.min(layout.height - p.y - p.height, offset?.y ?? 0)) }];
    }));
  });

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
            height: Math.max(word.offsetHeight + 8, matchMedia('(pointer: coarse)').matches ? 44 : 36),
            textWidth: word.offsetWidth, textHeight: word.offsetHeight };
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
    let lastPoint: Point = null;
    const preference = () => setMotionEnabled(!reduced.matches && fine.matches);
    preference();

    function showHint(link: HTMLAnchorElement | null) {
      clearTimeout(hideTimer);
      if (!link) {
        // Crossing a small gap must not restart the tooltip's entrance.
        hideTimer = window.setTimeout(() => { hint.hide(); shown = null; }, 100);
        return;
      }
      if (shown === link) return;
      const rect = link.getBoundingClientRect(), bounds = host!.getBoundingClientRect();
      // The selected link is pinned at its current animated position.
      // Do not replay the shared popup animation when the count changes.
      hint.show(t(locale, `${link.dataset.count} 篇笔记`, `${link.dataset.count} ${link.dataset.count === "1" ? "note" : "notes"}`), rect.left + rect.width / 2 - bounds.left, rect.top - bounds.top, true);
      shown = link;
    }
    function select(link: HTMLAnchorElement | null) {
      const id = link?.parentElement?.dataset.word;
      if (!id) active.set(null);
      else if (active.get()?.id !== id) {
        const current = live.current.get(id);
        active.set({ id, x: current?.x.get() ?? 0, y: current?.y.get() ?? 0 });
      }
      showHint(link);
    }
    function insideSelected(point: Exclude<Point, null>) {
      const selected = active.get(), p = selected && layout?.positions[selected.id];
      if (!selected || !p) return false;
      const scale = live.current.get(selected.id)?.scale.get() ?? 1;
      // Hold the selected native link across its full visible text extent.
      // Neighbor animation alone cannot steal the stationary pointer.
      return Math.abs(point.x - p.x - p.width / 2 - selected.x) <= Math.max(p.width, p.textWidth * scale) / 2
        && Math.abs(point.y - p.y - p.height / 2 - selected.y) <= Math.max(p.height, p.textHeight * scale) / 2;
    }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !fine.matches || event.buttons) return;
      const rect = element!.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < .1) return;
      lastPoint = point;
      pointer.set(point);
      focused = null;
      const candidate = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.tag-item') : null;
      const link = hovered && insideSelected(point) ? hovered : candidate;
      if (hovered !== link) { hovered = link; select(link); }
    }
    function press(event: PointerEvent) {
      if (event.pointerType === 'touch' || !fine.matches) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.tag-item') : null;
      if (link) { hovered = link; focused = null; select(link); }
    }
    function leave() {
      hovered = null; lastPoint = null;
      if (!focused) { pointer.set(null); active.set(null); showHint(null); }
    }
    function focus(event: FocusEvent) {
      const link = event.target;
      if (!(link instanceof HTMLAnchorElement) || !link.matches('.tag-item:focus-visible')) return;
      focused = link; hovered = null;
      const item = link.parentElement!;
      select(link);
      const selected = active.get();
      pointer.set({ x: item.offsetLeft + item.offsetWidth / 2 + (selected?.x ?? 0), y: item.offsetTop + item.offsetHeight / 2 + (selected?.y ?? 0) });
    }
    function blur() { focused = null; if (!hovered) { pointer.set(null); active.set(null); showHint(null); } }
    // Native links handle click, touch, Tab and Enter. No directional-key mode.
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerdown', press);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    reduced.addEventListener('change', preference);
    fine.addEventListener('change', preference);
    return () => {
      clearTimeout(hideTimer); hint.dispose(); pointer.set(null); active.set(null);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerdown', press);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      reduced.removeEventListener('change', preference);
      fine.removeEventListener('change', preference);
    };
  }, [layout, query, tags, tooltipId, pointer, active, motionEnabled]);

  return (
    <div className="tag-cloud-content" ref={root}>
      {tags.length > 0 && <div className="tag-tools">
        <label className="tag-search">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input id="tag-filter" ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t(locale, "筛选标签…", "Filter tags…")} aria-label={t(locale, "筛选标签", "Filter tags")} />
        </label>
        <p id="tag-count" className="sr-only" role="status" aria-live="polite">{locale === "en" ? `${visibleCount} ${visibleCount === 1 ? "tag" : "tags"}` : normalized ? `找到 ${visibleCount} 个标签` : `${tags.length} 个标签`}</p>
      </div>}
      <ul className="tag-word-cloud" aria-label={t(locale, "标签词云", "Tag cloud")} ref={cloud} hidden={visibleCount === 0} data-packed={Boolean(layout)} style={layout ? { height: layout.height } : undefined}>
        {tags.map(tag => <CloudWord locale={locale} key={tag.name} tag={tag} hidden={!tag.name.toLowerCase().includes(normalized)}
          position={layout?.positions[tag.name]} size={fontSize(tag.count)} plan={plan} active={active}
          enabled={motionEnabled} live={live.current} />)}
      </ul>
      {visibleCount === 0 && <div id="tag-empty" className="tag-cloud-empty">
        <p>{tags.length ? t(locale, "没有匹配的标签。换个关键词，再找找看。", "No matching tags. Try another keyword.") : t(locale, "标签还在慢慢收集，先翻开一篇笔记吧。", "No tags yet. Start with a note.")}</p>
        {tags.length ? <button id="tag-reset" type="button" className="blog-button" onClick={() => { setQuery(''); search.current?.focus(); }}>{t(locale, "清空筛选", "Clear filter")}</button> : <a className="blog-button" href={localizePath("/notes/", locale)}>{t(locale, "翻开笔记", "Browse notes")}</a>}
      </div>}
    </div>
  );
}
