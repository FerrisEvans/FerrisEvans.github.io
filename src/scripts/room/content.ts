export type RoomView = 'home' | 'work' | 'posts' | 'about' | 'online' | 'window' | 'tv' | 'calculator' | 'cd' | 'clock' | 'rolodex' | 'walkman';
export type RoomPost = { title: string; href: string; date: string; category: string };
export type RoomTopic = { title: string; description: string; href: string };
export type RoomContent = { author: string; intro: string; github: string; email: string; posts: RoomPost[]; topics: RoomTopic[] };
export const pageSize = 5;
export function pageInfo(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const page = Math.max(0, Math.min(pages - 1, Number.isFinite(requested) ? Math.trunc(requested) : 0));
  return { page, pages, previous: page > 0, next: page < pages - 1 };
}
export const viewLabels: Record<RoomView, string> = { home: '首页', work: '研究与实践', posts: '文章', about: '关于 Ferris', online: '在线联系', window: '窗外', tv: '电视', calculator: '计算器', cd:'CD 播放器',clock:'时钟',rolodex:'名片夹',walkman:'随身听' };
export function parseView(value: string): RoomView {
  return ['home', 'work', 'posts', 'about', 'online', 'window', 'tv', 'calculator', 'cd'].includes(value) ? value as RoomView : 'home';
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, limit: number) {
  const lines: string[] = [];
  let line = '';
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9_./+\-]*|\s+|[^\x00-\x7F]|./gu) ?? [];
  for (const token of tokens) {
    const pieces = ctx.measureText(token).width > width ? [...token] : [token];
    for (const piece of pieces) {
      if (line && ctx.measureText(line + piece).width > width) { lines.push(line.trimEnd()); line = ''; }
      if (line || piece.trim()) line += piece;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= limit) return lines;
  const result = lines.slice(0, limit);
  let last = result[limit - 1];
  while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
  result[limit - 1] = last + '…';
  return result;
}
