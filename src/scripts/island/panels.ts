import { parseView, viewLabels, type IslandView } from './types';
import { randomizeTagTokens } from '../tag-tokens';

/** Move server-rendered sections into one dialog. The same content remains
 * available without WebGL or JavaScript, with no duplicate headings or links. */
export function createPanels(onChange: (view: IslandView | null) => void, signal: AbortSignal) {
  const dialog = document.querySelector<HTMLDialogElement>('#island-dialog')!;
  const panel = document.querySelector<HTMLElement>('#island-panel')!;
  const directory = document.querySelector<HTMLElement>('#island-directory')!;
  const closeButton = document.querySelector<HTMLButtonElement>('#island-close')!;
  let selected: IslandView | null = null;
  let source: HTMLElement | null = null, placeholder: Comment | null = null, origin: HTMLElement | null = null;
  let ownedEntry = false, closeRequested = false, sequence = 0;
  let transition: Animation | undefined;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function restore() {
    if (source && placeholder?.parentNode) placeholder.replaceWith(source);
    source = null; placeholder = null;
  }
  function show(view: IslandView | null, focus = true) {
    closeRequested = false;
    if (selected === view) return;
    const previousView = selected;
    const current = ++sequence;
    transition?.cancel(); transition = undefined;
    selected = view;
    document.querySelectorAll('[data-island-view]').forEach(link => link.setAttribute('aria-expanded', String(link.getAttribute('data-island-view') === view)));
    if (!view) {
      onChange(null);
      const finish = () => {
        if (current !== sequence || signal.aborted) return;
        dialog.close(); restore();
        if (focus) requestAnimationFrame(() => {
          if (signal.aborted || selected) return;
          const target = origin?.isConnected && origin.checkVisibility() ? origin : document.querySelector<HTMLElement>(previousView ? `[data-island-access='${previousView}']` : '[data-island-access]');
          target?.focus({ preventScroll: true });
        });
      };
      if (reduced() || !dialog.open) finish();
      else {
        const animation = dialog.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
        transition = animation;
        void animation.finished.then(() => {
          if (current !== sequence) return;
          finish(); animation.cancel(); if (transition === animation) transition = undefined;
        }, () => {});
      }
      return;
    }
    restore();
    source = document.querySelector<HTMLElement>(`#${view}[data-island-section]`);
    if (!source) return;
    placeholder = document.createComment(`island-${view}`); source.before(placeholder); panel.append(source);
    if (view === 'tags') randomizeTagTokens(source);
    const label = document.querySelector('#island-panel-label'); if (label) label.textContent = viewLabels[view];
    dialog.setAttribute('aria-labelledby', `panel-${view}-title`);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    onChange(view);
    if (!reduced()) transition = dialog.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (focus) closeButton.focus({ preventScroll: true });
  }
  function open(view: IslandView, trigger?: HTMLElement) {
    // A pointer entered through the canvas, so restore focus to the scene.
    // Focusing an invisible keyboard trigger here would restart its hover
    // effect and tooltip even though the pointer is still over the close icon.
    origin = trigger ?? document.querySelector<HTMLElement>('#island-scene');
    if (!selected) {
      history.pushState({ ...history.state, islandPanel: true }, '', `#${view}`); ownedEntry = true;
    } else history.replaceState({ ...history.state, islandPanel: true }, '', `#${view}`);
    show(view);
  }
  function close() {
    if (!selected || closeRequested) return;
    closeRequested = true;
    if (ownedEntry && history.state?.islandPanel) { ownedEntry = false; history.back(); }
    else { history.replaceState(history.state, '', location.pathname + location.search); show(null); }
  }
  closeButton.addEventListener('click', close, { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }, { signal });
  document.querySelectorAll<HTMLAnchorElement>('[data-island-view]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const view = parseView(link.dataset.islandView!); if (!view) return;
      event.preventDefault(); open(view, link);
    }, { signal });
  });
  const fromLocation = () => { ownedEntry = Boolean(history.state?.islandPanel); show(parseView(location.hash)); };
  window.addEventListener('popstate', fromLocation, { signal });
  window.addEventListener('hashchange', fromLocation, { signal });
  fromLocation();
  return {
    open, close, get selected() { return selected; },
    enhanced(value: boolean) { directory.hidden = value; },
    dispose() { sequence++; transition?.cancel(); restore(); selected = null; dialog.close(); directory.hidden = false; },
  };
}
