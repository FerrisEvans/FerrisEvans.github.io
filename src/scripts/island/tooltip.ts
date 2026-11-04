import '../../styles/island-tooltip.css';

// Organic outline adapted from Animal Island UI 3.0.0 Tooltip (MIT, guokaigdg).
// Use the library's island / bordered shape without hydrating a React tree for
// a tooltip that follows ray-picked objects inside a Three canvas.
const outline = 'M0.501,0.005 L0.523,0.005 L0.549,0.006 C0.704,0.01,0.796,0.017,0.825,0.027 L0.827,0.028 C0.872,0.045,0.939,0.044,0.978,0.17 C1,0.254,1,0.365,0.99,0.505 L0.988,0.513 C0.979,0.558,0.971,0.598,0.965,0.633 C0.956,0.689,0.979,0.77,0.964,0.865 C0.953,0.928,0.921,0.966,0.869,0.979 C0.821,0.986,0.773,0.992,0.726,0.995 L0.712,0.996 L0.694,0.997 C0.648,1,0.586,1,0.507,1 L0.501,1 L0.464,1 C0.385,1,0.325,0.998,0.283,0.995 C0.234,0.992,0.184,0.987,0.133,0.979 C0.081,0.966,0.05,0.928,0.039,0.865 C0.023,0.77,0.047,0.689,0.037,0.633 C0.031,0.595,0.023,0.552,0.013,0.505 C-0.006,0.365,-0.002,0.254,0.024,0.17 C0.064,0.045,0.13,0.045,0.174,0.028 L0.175,0.028 C0.204,0.017,0.303,0.009,0.474,0.005 L0.501,0.005';

export function createIslandTooltip(host: HTMLElement, options: { id?: string } = {}) {
  const element = document.createElement('div');
  element.id = options.id ?? 'island-hint'; element.className = 'island-tooltip';
  element.hidden = true; element.setAttribute('role', 'tooltip');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1 1'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', outline); path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  const label = document.createElement('span'); element.append(svg, label); host.append(element);
  let last = '', appearance: Animation | undefined;
  return {
    show(text: string, x: number, y: number, reduced: boolean) {
      const changed = element.hidden || last !== text;
      if (last !== text) label.textContent = text;
      last = text; element.hidden = false;
      const width = element.offsetWidth, height = element.offsetHeight;
      const left = Math.max(10, Math.min(host.clientWidth - width - 10, x - width / 2));
      const above = y > height + 28;
      element.dataset.placement = above ? 'top' : 'bottom';
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(8, Math.min(host.clientHeight - height - 10, above ? y - height - 20 : y + 24))}px`;
      element.style.setProperty('--tail-left', `${Math.max(18, Math.min(width - 18, x - left))}px`);
      if (changed && !reduced) {
        appearance?.cancel();
        appearance = element.animate([{ opacity: 0, transform: 'translateY(5px) scale(.92)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 210, easing: 'cubic-bezier(.18,.8,.3,1.15)' });
      }
    },
    hide() { element.hidden = true; appearance?.cancel(); },
    dispose() { appearance?.cancel(); element.remove(); },
  };
}
