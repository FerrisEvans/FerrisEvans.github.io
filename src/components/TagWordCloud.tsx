import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { initialTagTokenColor, randomizeTagTokens } from '../scripts/tag-tokens';
import { createIslandTooltip } from '../scripts/island/tooltip';
import '../styles/tag-token.css';
import '../styles/tag-word-cloud.css';

interface TagWordCloudProps { tags: { name: string; count: number; href: string }[]; }
type Word = { name: string; count: number; width: number; height: number };
type Box = { name: string; width: number; height: number; x: number; y: number; insetX: number; insetY: number };
type CloudLayout = { height: number; positions: Record<string, { x: number; y: number }> };

/** Count controls both font size and distance from the center. Reserved space
 * lets neighboring words magnify without pushing the page layout around.
 * The links and their normal tab order stay in the same DOM throughout. */
function packWords(words: Word[], width: number): CloudLayout | null {
  if (!words.length || width < 1 || words.length > 160) return null;
  const spread = width < 600 ? 1.12 : 1.42, gap = width < 600 ? 8 : 12;
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
        placed.push({ name: word.name, width: w, height: h, x, y, insetX: (w - word.width) / 2, insetY: (h - word.height) / 2 }); found = true; break;
      }
      if (!found) break;
    }
    if (placed.length === words.length) {
      const top = Math.min(...placed.map(word => word.y));
      const bottom = Math.max(...placed.map(word => word.y + word.height));
      return { height: Math.ceil(bottom - top + 32), positions: Object.fromEntries(placed.map(word => [word.name, { x: Math.round(word.x + word.insetX), y: Math.round(word.y - top + 16 + word.insetY) }])) };
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
          const link = item.querySelector('a')!;
          // offset dimensions stay unscaled during Dock magnification.
          return { name: item.dataset.word!, count: Number(link.dataset.count), width: link.offsetWidth, height: link.offsetHeight };
        });
        setLayout(packWords(words, width));
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
    const words = [...element.querySelectorAll<HTMLAnchorElement>('li:not([hidden]) .tag-item')].map(link => ({
      link, item: link.parentElement!, scale: 1, lift: 0,
    }));
    let pointer: { x: number; y: number } | null = null;
    let hovered: HTMLAnchorElement | null = null, focused: HTMLAnchorElement | null = null;
    let frame = 0, previous = 0;

    const center = (word: typeof words[number]) => ({
      x: word.item.offsetLeft + word.item.offsetWidth / 2,
      y: word.item.offsetTop + word.item.offsetHeight / 2,
    });
    function showHint() {
      const link = focused ?? hovered;
      for (const word of words) word.link.dataset.cloudActive = String(word.link === link);
      if (!link) { hint.hide(); return; }
      const rect = link.getBoundingClientRect(), bounds = host!.getBoundingClientRect();
      hint.show(`${link.dataset.count} 篇笔记`, rect.left + rect.width / 2 - bounds.left, rect.top - bounds.top - 5, reduced.matches);
    }
    function draw(now: number) {
      frame = 0;
      const amount = reduced.matches ? 1 : 1 - Math.exp(-Math.min(previous ? (now - previous) / 1000 : 1 / 60, .05) * 17);
      previous = now;
      const focusWord = words.find(word => word.link === focused);
      const point = focusWord ? center(focusWord) : pointer;
      const animate = !reduced.matches && fine.matches;
      const radius = Math.min(240, Math.max(150, element!.clientWidth * .28));
      let unsettled = false;
      for (const word of words) {
        const origin = center(word);
        const distance = point ? Math.hypot(origin.x - point.x, (origin.y - point.y) * 1.2) : Infinity;
        const influence = animate && distance < radius ? (1 + Math.cos(Math.PI * distance / radius)) / 2 : 0;
        const growth = layout ? (element!.clientWidth < 600 ? .3 : .58) : .25;
        const targetScale = 1 + influence * growth, targetLift = -influence * 7;
        word.scale += (targetScale - word.scale) * amount;
        word.lift += (targetLift - word.lift) * amount;
        if (Math.abs(targetScale - word.scale) < .001) word.scale = targetScale;
        if (Math.abs(targetLift - word.lift) < .01) word.lift = targetLift;
        unsettled ||= word.scale !== targetScale || word.lift !== targetLift;
        word.link.style.setProperty('--cloud-scale', String(word.scale));
        word.link.style.setProperty('--cloud-lift', `${word.lift}px`);
        word.link.style.zIndex = String(Math.round(influence * 10));
      }
      element!.dataset.magnifying = String(Boolean(point) && animate);
      if (unsettled) frame = requestAnimationFrame(draw);
      else previous = 0;
    }
    function update() { if (!frame) frame = requestAnimationFrame(draw); }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !fine.matches) return;
      const rect = element!.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      focused = null;
      hovered = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.tag-item') : null;
      showHint(); update();
    }
    function leave() { pointer = null; hovered = null; showHint(); update(); }
    function focus(event: FocusEvent) {
      const link = event.target;
      if (!(link instanceof HTMLAnchorElement) || !link.matches('.tag-item:focus-visible')) return;
      focused = link; pointer = null; hovered = null; showHint(); update();
    }
    function blur() { focused = null; showHint(); update(); }
    function preference() { showHint(); update(); }
    // Native links handle click, touch, Tab and Enter. No directional-key mode.
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focus);
    element.addEventListener('focusout', blur);
    reduced.addEventListener('change', preference);
    fine.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame); hint.dispose();
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focus);
      element.removeEventListener('focusout', blur);
      reduced.removeEventListener('change', preference);
      fine.removeEventListener('change', preference);
      delete element.dataset.magnifying;
      for (const { link } of words) {
        link.style.removeProperty('--cloud-scale'); link.style.removeProperty('--cloud-lift'); link.style.removeProperty('z-index');
        delete link.dataset.cloudActive;
      }
    };
  }, [layout, query, tags, tooltipId]);

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
        {tags.map(tag => {
          const position = layout?.positions[tag.name];
          return <li key={tag.name} data-word={tag.name} hidden={!tag.name.toLowerCase().includes(normalized)} style={layout && position ? { position: 'absolute', left: position.x, top: position.y } : undefined}>
            <a className="tag-token tag-item" href={tag.href} data-count={tag.count} data-tag={tag.name.toLowerCase()} data-tag-token={tag.name} data-token-color={initialTagTokenColor(tag.name)} aria-label={`${tag.name}，${tag.count} 篇笔记`} style={{ '--tag-token-size': `${fontSize(tag.count)}px` } as CSSProperties}>
              <span className="tag-word">{tag.name}</span>
            </a>
          </li>;
        })}
      </ul>
      {visibleCount === 0 && <div id="tag-empty" className="tag-cloud-empty">
        <p>{tags.length ? '没有匹配的标签。换个关键词，再找找看。' : '标签还在慢慢收集，先翻开一篇笔记吧。'}</p>
        {tags.length ? <button id="tag-reset" type="button" className="blog-button" onClick={() => { setQuery(''); search.current?.focus(); }}>清空筛选</button> : <a className="blog-button" href="/notes/">翻开笔记</a>}
      </div>}
    </div>
  );
}
