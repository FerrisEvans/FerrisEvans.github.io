export type AvoidanceItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

type Offset = { x: number; y: number };
type Bounds = { width: number; height: number };

const MAX_MOVE = 36;
const MAX_CUSHION = 48;
const FULL_GROWTH = .9;
const AXIS_BLEND = 12;
const PASSES = 4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const halfWidth = (item: AvoidanceItem) => item.width * Math.max(1, item.scale) / 2;
const halfHeight = (item: AvoidanceItem) => item.height * Math.max(1, item.scale) / 2;

/** A continuous blend of the two separating axes. Direction comes from the
 * original centers, so relaxation cannot flip a word to the other side. */
function separation(a: AvoidanceItem, b: AvoidanceItem, at: Offset, bt: Offset, gap: number): Offset {
  const dx = b.x + bt.x - a.x - at.x;
  const dy = b.y + bt.y - a.y - at.y;
  const overlapX = halfWidth(a) + halfWidth(b) + gap - Math.abs(dx);
  const overlapY = halfHeight(a) + halfHeight(b) + gap - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return { x: 0, y: 0 };

  const baseX = b.x - a.x, baseY = b.y - a.y;
  const shortest = baseX || baseY
    ? Math.min(baseX ? overlapX : Infinity, baseY ? overlapY : Infinity)
    : Math.min(overlapX, overlapY);
  let x = baseX / (Math.abs(baseX) + 2) * Math.exp((shortest - overlapX) / AXIS_BLEND);
  let y = baseY / (Math.abs(baseY) + 2) * Math.exp((shortest - overlapY) / AXIS_BLEND);
  const length = Math.hypot(x, y);
  if (length < 1e-9) {
    // Coincident centers have no geometric direction. A stable ID ordering is
    // only a fallback for malformed/overlapping input, never random jitter.
    if (overlapX < overlapY) x = a.id < b.id ? 1 : -1;
    else y = a.id < b.id ? 1 : -1;
  } else {
    x /= length;
    y /= length;
  }
  const distance = Math.min(x ? overlapX / Math.abs(x) : Infinity, y ? overlapY / Math.abs(y) : Infinity);
  return { x: x * distance, y: y * distance };
}

/** Return offsets from the supplied resting centers; never feed prior offsets
 * back into these items. Width/height describe unscaled text, not reserved hit
 * boxes. No active item (including disabled motion) leaves the layout exact. */
export function solveAvoidance(items: AvoidanceItem[], activeId: string | null, bounds: Bounds): Record<string, Offset> {
  const offsets: Record<string, Offset> = Object.fromEntries(items.map(item => [item.id, { x: 0, y: 0 }]));
  const active = activeId === null ? undefined : items.find(item => item.id === activeId);
  if (!active || !Number.isFinite(active.scale) || active.scale <= 1) return offsets;

  const growth = clamp((active.scale - 1) / FULL_GROWTH, 0, 1);
  const limit = MAX_MOVE * growth;
  const cushion = MAX_CUSHION * growth;
  const gap = 2 * growth;
  const local = items.filter(item => item !== active &&
    Math.abs(item.x - active.x) < halfWidth(active) + halfWidth(item) + cushion + MAX_MOVE * 2 &&
    Math.abs(item.y - active.y) < halfHeight(active) + halfHeight(item) + cushion + MAX_MOVE * 2);

  function constrain(item: AvoidanceItem, desired: Offset): Offset {
    const length = Math.hypot(desired.x, desired.y);
    const factor = length > limit ? limit / length : 1;
    // Include zero in each interval: if an already enlarged word crosses an
    // edge, do not move a previously unaffected word just to correct that.
    // An impossible fit is left for the caller rather than changing its scale.
    return {
      x: clamp(desired.x * factor, Math.min(0, halfWidth(item) - item.x), Math.max(0, bounds.width - halfWidth(item) - item.x)),
      y: clamp(desired.y * factor, Math.min(0, halfHeight(item) - item.y), Math.max(0, bounds.height - halfHeight(item) - item.y)),
    };
  }

  function pushFromActive() {
    for (const item of local) {
      const current = offsets[item.id];
      const push = separation(active!, item, offsets[active!.id], current, cushion);
      offsets[item.id] = constrain(item, { x: current.x + push.x, y: current.y + push.y });
    }
  }

  pushFromActive();
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < local.length; i++) {
      for (let j = i + 1; j < local.length; j++) {
        const a = local[i], b = local[j];
        const at = offsets[a.id], bt = offsets[b.id];
        if (at.x === 0 && at.y === 0 && bt.x === 0 && bt.y === 0) continue;
        const push = separation(a, b, at, bt, gap);
        if (push.x === 0 && push.y === 0) continue;
        // Fade in propagated corrections as the local movement starts, rather
        // than activating a full secondary correction at the first subpixel.
        const share = Math.min(1, (Math.hypot(at.x, at.y) + Math.hypot(bt.x, bt.y)) / 8) / 2;
        offsets[a.id] = constrain(a, { x: at.x - push.x * share, y: at.y - push.y * share });
        offsets[b.id] = constrain(b, { x: bt.x + push.x * share, y: bt.y + push.y * share });
      }
    }
    // The active word has priority over propagated, small neighbor gaps.
    pushFromActive();
  }
  return offsets;
}
