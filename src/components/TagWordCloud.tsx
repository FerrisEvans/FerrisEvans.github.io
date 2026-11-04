import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { initialTagTokenColor, randomizeTagTokens } from '../scripts/tag-tokens';
import '../styles/tag-token.css';
import '../styles/tag-word-cloud.css';

interface TagWordCloudProps { tags: { name: string; count: number; href: string }[]; }
type Box = { name: string; width: number; height: number; x: number; y: number };
type CloudLayout = { height: number; positions: Record<string, { x: number; y: number }> };

/** Largest words occupy the center; smaller links fill an elliptical spiral.
 * The links and their normal tab order stay in the same DOM throughout. */
function packWords(words: Omit<Box, 'x' | 'y'>[], width: number): CloudLayout | null {
  if (!words.length || width < 1 || words.length > 160) return null;
  const gap = 6;
  const area = words.reduce((sum, word) => sum + (word.width + gap) * (word.height + gap), 0);
  let height = Math.max(280, area / (width * .48));
  for (let pass = 0; pass < 3; pass++, height *= 1.25) {
    const placed: Box[] = [];
    for (const word of words) {
      let found = false;
      for (let step = 0; step < 2800; step++) {
        const angle = step * .42;
        const radius = Math.sqrt(step / 2800) * height * .64;
        const x = (width - word.width) / 2 + Math.cos(angle) * radius * width / height;
        const y = (height - word.height) / 2 + Math.sin(angle) * radius;
        if (x < 2 || y < 2 || x + word.width > width - 2 || y + word.height > height - 2) continue;
        if (placed.some(box => x < box.x + box.width + gap && x + word.width + gap > box.x && y < box.y + box.height + gap && y + word.height + gap > box.y)) continue;
        placed.push({ ...word, x, y }); found = true; break;
      }
      if (!found) break;
    }
    if (placed.length === words.length) {
      const top = Math.min(...placed.map(word => word.y));
      const bottom = Math.max(...placed.map(word => word.y + word.height));
      return { height: Math.ceil(bottom - top + 32), positions: Object.fromEntries(placed.map(word => [word.name, { x: Math.round(word.x), y: Math.round(word.y - top + 16) }])) };
    }
  }
  return null; // Natural, weighted wrapping remains usable for unusually long collections.
}

export default function TagWordCloud({ tags }: TagWordCloudProps) {
  const root = useRef<HTMLDivElement>(null);
  const cloud = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
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
          const box = item.querySelector('a')!.getBoundingClientRect();
          return { name: item.dataset.word!, width: box.width, height: box.height };
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
            <a className="tag-token tag-item" href={tag.href} data-tag={tag.name.toLowerCase()} data-tag-token={tag.name} data-token-color={initialTagTokenColor(tag.name)} aria-label={`${tag.name}，${tag.count} 篇笔记`} style={{ '--tag-token-size': `${fontSize(tag.count)}px` } as CSSProperties}>
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
