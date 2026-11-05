import { type Locale } from '../i18n';
import data from './room-about.json';
import { categoryOf } from './site';

/** Chinese source stays in room-about.json; both surfaces share these translations. */
export const ABOUT = data;
const ABOUT_EN: typeof data = {
  ...data,
  greeting: 'Hi, I’m {author}.',
  intro: 'I’m a developer interested in game development, programming languages, and AI agents—from engines to games, and from theory to practice. This is my personal blog, where I keep learning notes and share a few thoughts along the way.',
  principles: [
    'Practice builds skill. Without enough practice, it is too early to talk about talent. Practice is more than repetition or copying someone else’s code: each attempt should add a challenge and expand your understanding. Repeated cycles of learning, evaluating, creating, and correcting can lead to remarkable change.',
    'Your command of English sets the ceiling for how far you can go as a programmer.',
    'Good habits help you achieve more with less effort.',
    'Do not wait until you feel ready to begin. Good programmers explore unfamiliar ground.',
    'The foolish remain confused; the wise ask questions.',
    'The simplest approach is often the most effective.',
    'Learn from successful people and successful projects.',
    'Creating something is one of the best ways to learn.',
    'Keep going. Commit to learning over the long term—even for a lifetime.',
    'Get your hands on the code. However simple an example looks, type it out yourself at least once to check that you understand the details.',
    'Learn to think about why an approach works this way rather than another way, and carry that understanding into other situations.',
    'Do not buy books indiscriminately or chase every new technology and buzzword. Fundamentals built over time will remain useful for at least the next decade.',
    'Look back at the history of technology and how it developed. That perspective helps you understand what tomorrow might look like.',
  ],
  practice: { ...data.practice, title: 'Practice and the Long View', attribution: '— John Carmack' },
};

export const aboutFor = (locale: Locale) => locale === 'en' ? ABOUT_EN : ABOUT;
export const aboutGreeting = (author: string, locale: Locale = 'zh') => aboutFor(locale).greeting.replace('{author}', author);
export const aboutInterests = (locale: Locale = 'zh') => aboutFor(locale).interests.map(slug => categoryOf(slug, locale));
