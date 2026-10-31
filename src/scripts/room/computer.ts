import { ABOUT as about, aboutGreeting, aboutInterests, aboutPlainText } from '../../data/room-about';

export type ComputerPage = { title: string; lines: string[] };
export type ComputerSection = { title: string; paragraphs: readonly string[] };
type ComputerContent = { author: string; intro: string; github: string; email: string };
type Context = CanvasRenderingContext2D;

const bodyFont = '24px RoomPixel, RoomPixelZH, "PingFang SC", monospace';
const titleFont = '36px RoomPixel, RoomPixelZH, "PingFang SC", monospace';
const foreground = '#d5e2bc', dim = '#8ea581', border = '#62775b';
const linesPerPage = 8;

// At 24 px, VT323 ASCII fits a 12 px cell and Fusion Pixel CJK fits 24 px.
// Reserving 54 half-width cells keeps every pre-paginated line inside 648 px.
const cells = (value: string) => [...value].reduce((sum, char) => sum + (char.codePointAt(0)! < 128 ? 1 : 2), 0);
function wrap(value: string): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let current = '';
    const tokens = paragraph.match(/[A-Za-z0-9_]+(?:[-'./][A-Za-z0-9_]+)*[.,:;!?，。；：！？]*|\s+|[^\x00-\x7F][，。、；：！？）》」』】”’]*|./gu) ?? [];
    for (const token of tokens) {
      const pieces = cells(token) > 54 ? [...token] : [token];
      for (const piece of pieces) {
        if (current && cells(current + piece) > 54) { lines.push(current.trimEnd()); current = ''; }
        if (current || piece.trim()) current += piece;
      }
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines;
}

/** Continuous text: short sections share a page; later pages retain their section title. */
export function paginateComputerSections(sections: readonly ComputerSection[]): ComputerPage[] {
  const pages: ComputerPage[] = [];
  let current: string[] = [], title = '';
  const flush = () => { if (current.length) pages.push({ title, lines: current }); current = []; };
  for (const section of sections) {
    const paragraphs = section.paragraphs.map(wrap).filter(lines => lines.length);
    if (!paragraphs.length) continue;
    const openingLines = Math.min(2, paragraphs[0].length);
    if (current.length > linesPerPage - 1 - openingLines) flush();
    if (current.length) {
      if (current.length + 2 + openingLines <= linesPerPage) current.push('');
      current.push(`— ${section.title} —`);
    } else title = section.title;
    let first = true;
    for (const paragraph of paragraphs) {
      // Keep an opening pair together, so an interest label never sits alone
      // at the foot of a page. Longer paragraphs may still continue naturally.
      const opening = Math.min(2, paragraph.length);
      if (current.length && linesPerPage - current.length < opening) flush();
      if (!first && current.length && current.length + 1 + opening <= linesPerPage) current.push('');
      for (const line of paragraph) {
        if (current.length === linesPerPage) flush();
        if (!current.length) title = section.title;
        current.push(line);
      }
      first = false;
    }
  }
  flush();
  return pages;
}

/** Every paragraph comes from the same source as the ordinary About page. */
export function computerPages(content: ComputerContent): ComputerPage[] {
  return paginateComputerSections([
    { title: aboutGreeting(content.author), paragraphs: [about.intro] },
    { title: '研究方向', paragraphs: aboutInterests().map((item, i) => `${String(i + 1).padStart(2, '0')}  ${item.label}\n${item.description}`) },
    { title: '一些相信的事', paragraphs: about.principles.map((value, i) => `${String(i + 1).padStart(2, '0')}  ${value}`) },
    { title: about.practice.title, paragraphs: [...about.practice.quotes, about.practice.attribution] },
    { title: about.zen.title, paragraphs: [`${about.zen.author}\n${about.zen.command}`, ...about.zen.lines.map((value, i) => `${String(i + 1).padStart(2, '0')}  ${value}`)] },
    { title: about.formatting.title, paragraphs: about.formatting.paragraphs.map(aboutPlainText) },
  ]);
}

function text(ctx: Context, value: string, x: number, y: number, color = foreground, large = false, align: CanvasTextAlign = 'left') {
  ctx.font = large ? titleFont : bodyFont;
  ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function rectangle(ctx: Context, x: number, y: number, width: number, height: number, fill: string, stroke = border) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x, y, width, height);
}
function tab(ctx: Context, label: string, x: number, width: number, active: boolean) {
  rectangle(ctx, x, 18, width, 54, active ? '#b5c69d' : '#243528');
  text(ctx, label, x + width / 2, 55, active ? '#17251a' : dim, true, 'center');
}
function navigation(ctx: Context, index: number, count: number, online: boolean) {
  const current = online ? 1 : Math.max(1, Math.min(index + 1, count)), total = online ? 1 : Math.max(1, count);
  rectangle(ctx, 48, 510, 140, 50, '#243528');
  rectangle(ctx, 580, 510, 140, 50, '#243528');
  text(ctx, '< PREV', 118, 543, !online && current > 1 ? foreground : '#5e7358', false, 'center');
  text(ctx, 'NEXT >', 650, 543, !online && current < total ? foreground : '#5e7358', false, 'center');
  text(ctx, `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 384, 543, dim, false, 'center');
}

/** Paint only; the caller owns hit regions, focus, paging and link activation. */
export function paintComputer(ctx: Context, page: ComputerPage, index: number, count: number, mode: 'about' | 'online', content: ComputerContent): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.setLineDash([]);
  ctx.fillStyle = '#17251a'; ctx.fillRect(0, 0, 768, 576);
  tab(ctx, 'ABOUT', 48, 220, mode === 'about');
  tab(ctx, 'ONLINE', 470, 250, mode === 'online');
  rectangle(ctx, 36, 88, 696, 404, '#0a160e');
  text(ctx, mode === 'online' ? `联系 ${content.author}` : page.title, 60, 121, foreground, true);
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48, 136); ctx.lineTo(720, 136); ctx.stroke();

  if (mode === 'about') {
    ctx.save(); ctx.beginPath(); ctx.rect(48, 145, 672, 337); ctx.clip();
    page.lines.forEach((line, i) => text(ctx, line, 60, 172 + i * 42));
    ctx.restore();
  } else {
    rectangle(ctx, 48, 185, 672, 72, '#243528');
    text(ctx, '1  GitHub', 72, 213, dim);
    text(ctx, content.github, 72, 244);
    rectangle(ctx, 48, 285, 672, 72, '#243528');
    text(ctx, '2  Email', 72, 313, dim);
    text(ctx, content.email, 72, 344);
    // Reserve the full three-line introduction inside the terminal panel.
    ctx.save(); ctx.beginPath(); ctx.rect(48, 374, 672, 108); ctx.clip();
    wrap(content.intro).forEach((line, i) => text(ctx, line, 60, 398 + i * 36, dim));
    ctx.restore();
  }
  if(mode==='online')text(ctx, 'Q  HANG UP / TERMINAL', 384, 543, dim, false, 'center');
  else navigation(ctx, index, count, false);
  ctx.restore();
}
