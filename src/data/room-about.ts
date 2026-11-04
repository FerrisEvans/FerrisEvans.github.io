import data from './room-about.json';
import { categoryOf } from './site';

/** Edit biography text once in room-about.json; category descriptions stay in site.ts. */
export const ABOUT = data;
export const aboutGreeting = (author: string) => ABOUT.greeting.replace('{author}', author);
export const aboutInterests = () => ABOUT.interests.map(categoryOf);
