import copy from 'naive-icons/svg/copy.svg?raw';
import check from 'naive-icons/svg/check.svg?raw';
import error from 'naive-icons/svg/x-circle.svg?raw';

const icons = { copy, check, error };
export type BlogIconName = keyof typeof icons;

/** The same packaged artwork as the server-rendered blog icons, without hydration. */
export function createBlogIcon(name: BlogIconName, size = 22) {
  const wrapper = document.createElement('span');
  wrapper.className = 'island-icon';
  wrapper.setAttribute('aria-hidden', 'true');
  // Only SVG assets imported from our pinned icon dependency enter this template.
  wrapper.innerHTML = icons[name];
  const svg = wrapper.querySelector('svg')!;
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.iconFamily = 'naive-icons';
  svg.dataset.icon = name;
  return wrapper;
}
