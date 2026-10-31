import data from './room-about.json';
import { categoryOf } from './site';

export type AboutInline = { text: string; tag?: 'strong' | 'code' | 'em' | 'sub' | 'span' | 'u'; accent?: boolean };

/** Edit biography text once in room-about.json; category descriptions stay in site.ts. */
export const ABOUT = {
  ...data,
  formatting: { ...data.formatting, paragraphs: data.formatting.paragraphs as AboutInline[][] },
};
export const aboutGreeting = (author: string) => ABOUT.greeting.replace('{author}', author);
export const aboutInterests = () => ABOUT.interests.map(categoryOf);
export const aboutPlainText = (paragraph: readonly AboutInline[]) => paragraph.map(part => part.text).join('');
