import {
  createPane,
  dropSprite,
  FOG,
  FOG_BACK,
  FOG_SCALE,
  FOG_STEP,
  MAX_DROPS,
  paintWater,
  rainDrop,
  RUN_AT,
  stepDrops,
  toRgb,
  WATER_SCALE,
  WIPE_WIDTH,
  type Drop,
  type Pane,
} from "./rain-glass-gl";

interface RainGlassControllerOptions {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  fogElement: HTMLSpanElement;
  src: string;
  rain: number;
  interactive: boolean;
}

export class RainGlassController {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly fogElement: HTMLSpanElement;
  private readonly src: string;
  private readonly rain: number;
  private readonly interactive: boolean;
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly sprite = dropSprite();
  private readonly waterCanvas = document.createElement("canvas");
  private readonly clearCanvas = document.createElement("canvas");
  private readonly hand = { down: false, x: 0, y: 0 };
  private pane: Pane | null = null;
  private probe: CanvasRenderingContext2D | null = null;
  private water: CanvasRenderingContext2D | null = null;
  private clear: CanvasRenderingContext2D | null = null;
  private drops: Drop[] = [];
  private width = 0;
  private height = 0;
  private raf = 0;
  private last = 0;
  private visible = true;
  private onScreen = true;
  private spawn = 0;
  private fogClock = 0;
  private colorKey = "";
  private colorTimer = 0;
  private resizeObserver?: ResizeObserver;
  private intersection?: IntersectionObserver;
  private image?: HTMLImageElement;
  private sceneReady = false;

  constructor(options: RainGlassControllerOptions) {
    this.root = options.root;
    this.canvas = options.canvas;
    this.fogElement = options.fogElement;
    this.src = options.src;
    this.rain = options.rain;
    this.interactive = options.interactive;
  }

  mount() {
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
    this.probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    this.pane = gl ? createPane(gl) : null;
    this.water = this.waterCanvas.getContext("2d");
    this.clear = this.clearCanvas.getContext("2d");
    if (!(this.pane && this.probe && this.water && this.clear)) return;

    this.readFog();
    this.build();
    this.canvas.style.opacity = "0";
    delete this.root.dataset.loaded;
    this.loadImage();
    this.observeViewport();
    this.colorTimer = window.setInterval(() => {
      if (this.visible && this.readFog() && this.reduceMotion) this.render();
    }, 500);

    if (this.interactive) {
      this.root.addEventListener("pointerdown", this.onDown);
      this.root.addEventListener("pointermove", this.onMove);
      window.addEventListener("pointerup", this.onUp);
      window.addEventListener("pointercancel", this.onUp);
    }
  }

  private observeViewport() {
    this.resizeObserver = new ResizeObserver(() => this.build());
    this.resizeObserver.observe(this.root);
    this.intersection = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      this.updateVisibility();
    });
    this.intersection.observe(this.root);
    document.addEventListener("visibilitychange", this.updateVisibility);
  }

  private updateVisibility = () => {
    this.visible = this.onScreen && document.visibilityState === "visible";
    this.start();
  };

  private loadImage() {
    const image = new Image();
    this.image = image;
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      this.pane?.setScene(image, this.width, this.height);
      this.sceneReady = true;
      this.render();
      this.root.dataset.loaded = "true";
      this.canvas.style.opacity = "1";
      this.start();
    };
    image.src = this.src;
  }

  private readFog() {
    if (!this.pane || !this.probe) return false;
    const color = getComputedStyle(this.fogElement).color;
    if (color === this.colorKey) return false;
    this.colorKey = color;
    this.pane.setFog(toRgb(color, this.probe), FOG);
    return true;
  }

  private render() {
    if (!(this.pane && this.water)) return;
    paintWater(this.water, this.drops, this.sprite, this.width, this.height);
    this.pane.upload(this.waterCanvas, this.clearCanvas);
    this.pane.draw();
  }

  private build() {
    if (!(this.pane && this.clear)) return;
    const rect = this.root.getBoundingClientRect();
    const resized = Math.abs(rect.width - this.width) > 1 || Math.abs(rect.height - this.height) > 1;
    this.width = rect.width;
    this.height = rect.height;
    if (this.width < 2 || this.height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.pane.resize(this.canvas.width, this.canvas.height, this.width, this.height);
    this.pane.setCover(this.width, this.height);
    this.waterCanvas.width = Math.round(this.width * WATER_SCALE);
    this.waterCanvas.height = Math.round(this.height * WATER_SCALE);
    this.clearCanvas.width = Math.round(this.width * FOG_SCALE);
    this.clearCanvas.height = Math.round(this.height * FOG_SCALE);
    this.clear.fillStyle = "black";
    this.clear.fillRect(0, 0, this.clearCanvas.width, this.clearCanvas.height);
    if (resized || this.drops.length === 0) this.seedDrops();
    this.render();
  }

  private seedDrops() {
    this.drops = [];
    const settled = Math.round(20 + this.rain * 40);
    for (let i = 0; i < settled; i++) {
      const drop = rainDrop(this.width, this.height);
      drop.r = Math.min(drop.r, RUN_AT - 0.5);
      this.drops.push(drop);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.visible || !this.clear) return;
    const dt = Math.min((now - (this.last || now - 16)) / 1000, 1 / 20);
    this.last = now;
    this.spawnDrops(dt);
    const fresh = stepDrops(this.drops, dt, this.height, this.clear);
    this.drops = this.drops.filter((drop) => drop.r > 0.6).concat(fresh);
    this.fadeWipedGlass(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private spawnDrops(dt: number) {
    this.spawn += dt * (4 + this.rain * 22);
    while (this.spawn > 1) {
      this.spawn -= 1;
      if (this.drops.length < MAX_DROPS) {
        this.drops.push(rainDrop(this.width, this.height));
      } else {
        const drop = this.drops[Math.floor(Math.random() * this.drops.length)];
        drop.r = Math.min(14, drop.r + 1.2);
      }
    }
  }

  private fadeWipedGlass(dt: number) {
    if (!this.clear) return;
    this.fogClock += dt;
    if (this.fogClock <= FOG_STEP) return;
    this.clear.fillStyle = `rgba(0, 0, 0, ${(this.fogClock / FOG_BACK) * 2.4})`;
    this.clear.fillRect(0, 0, this.clearCanvas.width, this.clearCanvas.height);
    this.clear.fillStyle = "white";
    this.fogClock = 0;
  }

  private start() {
    if (!this.raf && this.visible && this.sceneReady && !this.reduceMotion) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private local(event: PointerEvent) {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private wipe(x: number, y: number) {
    if (!this.clear) return;
    this.clear.strokeStyle = "white";
    this.clear.lineCap = "round";
    this.clear.lineWidth = WIPE_WIDTH * FOG_SCALE;
    this.clear.filter = "blur(3px)";
    this.clear.beginPath();
    this.clear.moveTo(this.hand.x * FOG_SCALE, this.hand.y * FOG_SCALE);
    this.clear.lineTo(x * FOG_SCALE, y * FOG_SCALE);
    this.clear.stroke();
    this.clear.filter = "none";
    const reach = WIPE_WIDTH / 2;
    for (const drop of this.drops) {
      if (Math.hypot(drop.x - x, drop.y - y) < reach + drop.r * 0.5) drop.r = 0;
    }
    this.hand.x = x;
    this.hand.y = y;
    if (this.reduceMotion) this.render();
  }

  private onDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest("a, button, input, textarea")) return;
    const point = this.local(event);
    this.hand.down = true;
    this.hand.x = point.x;
    this.hand.y = point.y;
    this.wipe(point.x, point.y);
  };

  private onMove = (event: PointerEvent) => {
    if (!this.hand.down) return;
    const point = this.local(event);
    this.wipe(point.x, point.y);
  };

  private onUp = () => {
    this.hand.down = false;
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.style.opacity = "0";
    delete this.root.dataset.loaded;
    if (this.image) this.image.onload = null;
    window.clearInterval(this.colorTimer);
    this.resizeObserver?.disconnect();
    this.intersection?.disconnect();
    document.removeEventListener("visibilitychange", this.updateVisibility);
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    this.pane?.destroy();
  }
}
