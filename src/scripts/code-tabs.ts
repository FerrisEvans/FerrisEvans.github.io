import { initCodeGroups } from 'rehype-code-group/client';
import { createBlogIcon, type BlogIconName } from './blog-icons';

function copyControl(getCode: () => HTMLPreElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  button.setAttribute('aria-label', '复制代码');
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const show = (icon: BlogIconName, title: string) => {
    button.replaceChildren(createBlogIcon(icon));
    button.title = title;
  };
  show('copy', '复制代码');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  const reset = () => {
    revision++;
    clearTimeout(timer);
    button.dataset.copied = 'false';
    status.textContent = '';
    show('copy', '复制代码');
  };
  button.addEventListener('click', async () => {
    reset();
    const current = revision;
    try {
      const pre = getCode();
      await navigator.clipboard.writeText((pre.querySelector('code') ?? pre).textContent ?? '');
      if (current !== revision) return;
      button.dataset.copied = 'true';
      show('check', '已复制');
      status.textContent = '代码已复制';
    } catch {
      if (current !== revision) return;
      show('error', '复制失败，请重试');
      status.textContent = '复制失败，请重试';
    }
    timer = setTimeout(reset, 1600);
  });
  return { button, status, reset };
}

function addGroupCopyControl(group: HTMLElement) {
  if (group.dataset.codeCopy) return;
  const tablist = group.querySelector<HTMLElement>(':scope > .rcg-tab-container');
  const panels = Array.from(group.querySelectorAll<HTMLElement>(':scope > .rcg-block'));
  // The plugin also supports rich panels. Only simple one-fence-per-tab groups
  // get one shared copy button; other content retains ordinary per-block copy.
  if (!tablist || !panels.length || panels.some(panel => panel.children.length !== 1 || panel.firstElementChild?.tagName !== 'PRE')) return;
  const header = document.createElement('div');
  header.className = 'code-block-header code-group-header';
  tablist.setAttribute('aria-label', '代码语言');
  const copy = copyControl(() => (panels.find(panel => !panel.hidden) ?? panels[0]).querySelector<HTMLPreElement>('pre')!);
  group.addEventListener('rehype-code-group:change', event => {
    if (event.target === group) copy.reset();
  });
  tablist.before(header);
  header.append(tablist, copy.button, copy.status);
  group.dataset.codeCopy = 'true';
}

/** The library owns tab parsing, keyboard navigation, ARIA and no-JS fallback. */
export function enhanceCodeBlocks(root: ParentNode = document) {
  initCodeGroups(root);
  root.querySelectorAll<HTMLElement>('.prose-custom .rehype-code-group').forEach(addGroupCopyControl);
  root.querySelectorAll<HTMLPreElement>('.prose-custom pre').forEach(pre => {
    if (pre.closest('[data-code-copy]') || pre.parentElement?.classList.contains('code-block')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const header = document.createElement('div');
    header.className = 'code-block-header';
    const language = document.createElement('span');
    language.className = 'code-language';
    language.textContent = pre.getAttribute('data-language') || 'code';
    const copy = copyControl(() => pre);
    header.append(language, copy.button, copy.status);
    pre.before(wrapper);
    wrapper.append(header, pre);
  });
}
