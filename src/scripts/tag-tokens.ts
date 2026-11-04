/** Animal Island UI soft-tag hues, with readable light/dark pairs in tag-token.css. */
export const TAG_TOKEN_COLORS = ['pink', 'purple', 'blue', 'teal', 'green', 'red', 'brown', 'amber'] as const;
export type TagTokenColor = typeof TAG_TOKEN_COLORS[number];

function hash(value: string) {
  let result = 0;
  for (const character of value) result = (result * 31 + character.codePointAt(0)!) >>> 0;
  return result;
}

/** Stable SSR colors keep the no-JavaScript presentation complete. */
export function initialTagTokenColor(name: string): TagTokenColor {
  return TAG_TOKEN_COLORS[hash(name) % TAG_TOKEN_COLORS.length];
}

let previousShift: number | undefined;
function nextShift() {
  const size = TAG_TOKEN_COLORS.length;
  if (previousShift === undefined) {
    try {
      const stored = Number(sessionStorage.getItem('weijin-tag-color-shift'));
      previousShift = Number.isInteger(stored) && stored >= 0 && stored < size ? stored : 0;
    } catch { previousShift = 0; }
  }
  // A nonzero random step changes the assignment on every initialization/open.
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  previousShift = (previousShift + 1 + random[0] % (size - 1)) % size;
  try { sessionStorage.setItem('weijin-tag-color-shift', String(previousShift)); } catch {}
  return previousShift;
}

/** Call again with the keyword section whenever its panel opens. No navigation handlers. */
export function randomizeTagTokens(scope: ParentNode = document) {
  const tokens = [...scope.querySelectorAll<HTMLElement>('[data-tag-token]')];
  if (scope instanceof HTMLElement && scope.matches('[data-tag-token]')) tokens.unshift(scope);
  if (!tokens.length) return;
  const shift = nextShift();
  for (const token of tokens) {
    const name = token.dataset.tagToken ?? token.textContent ?? '';
    const index = (hash(name) + shift) % TAG_TOKEN_COLORS.length;
    token.dataset.tokenColor = TAG_TOKEN_COLORS[index];
  }
}

let initialized = false;
export function initializeTagTokenColors() {
  if (initialized) return;
  initialized = true;
  randomizeTagTokens();
  window.addEventListener('pageshow', event => {
    if (event.persisted) randomizeTagTokens();
  });
}
