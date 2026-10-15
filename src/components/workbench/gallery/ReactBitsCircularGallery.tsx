import { useUiText } from "@/i18n";
import { Camera, Mesh, Plane, Program, Raycast, Renderer, Texture, Transform } from "ogl";
import { useEffect, useRef } from "react";
import "./ReactBitsCircularGallery.css";

type GL = Renderer["gl"];
type Direction = "right" | "left";

const SCROLL_SETTLE_EPSILON = 0.0005;

export interface ReactBitsCircularGalleryItem {
  id: string;
  image: string;
  text: string;
}

interface ReactBitsCircularGalleryProps {
  items: ReactBitsCircularGalleryItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
  onActiveHoverChange?: (hovered: boolean) => void;
  onReady?: () => void;
  onWebGLUnavailable?: () => void;
  bend?: number;
  textColor?: string;
  borderRadius?: number;
  font?: string;
  scrollSpeed?: number;
  scrollEase?: number;
  reduceMotion?: boolean;
  paused?: boolean;
}

interface ScreenSize {
  width: number;
  height: number;
}

interface Viewport {
  width: number;
  height: number;
}

interface SharedTexture {
  texture: Texture;
  loaded: Promise<HTMLImageElement | null>;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function getFontSize(font: string): number {
  const match = font.match(/(\d+)px/);
  return match ? Number.parseInt(match[1], 10) : 30;
}

function createPlaceholderCanvas(index: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = index % 2 === 0 ? "#2b3138" : "#353c45";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function createTextTexture(
  gl: GL,
  text: string,
  font: string,
  color: string
): { texture: Texture; width: number; height: number } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画廊文字纹理");
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 24;
  const height = Math.ceil(getFontSize(font) * 1.2) + 20;
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  context.font = font;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

class GalleryTitle {
  readonly gl: GL;
  readonly geometry: Plane;
  readonly program: Program;
  readonly mesh: Mesh;
  readonly texture: Texture;

  constructor(gl: GL, plane: Mesh, text: string, textColor: string, font: string) {
    this.gl = gl;
    const titleTexture = createTextTexture(gl, text, font, textColor);
    this.texture = titleTexture.texture;
    this.geometry = new Plane(gl);
    this.program = new Program(gl, {
      vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          if (color.a < 0.1) discard;
          gl_FragColor = color;
        }
      `,
      uniforms: { tMap: { value: this.texture } },
      transparent: true
    });
    this.mesh = new Mesh(gl, { geometry: this.geometry, program: this.program });
    const textHeight = plane.scale.y * 0.15;
    this.mesh.scale.set(textHeight * (titleTexture.width / titleTexture.height), textHeight, 1);
    this.mesh.position.y = -plane.scale.y * 0.5 - textHeight * 0.5 - 0.05;
    this.mesh.setParent(plane);
  }

  resize(plane: Mesh): void {
    const image = this.texture.image as HTMLCanvasElement | undefined;
    if (!image) return;
    const textHeight = plane.scale.y * 0.15;
    this.mesh.scale.set(textHeight * (image.width / image.height), textHeight, 1);
    this.mesh.position.y = -plane.scale.y * 0.5 - textHeight * 0.5 - 0.05;
  }

  destroy(): void {
    this.geometry.remove();
    this.program.remove();
    this.gl.deleteTexture(this.texture.texture);
  }
}

interface GalleryMediaConfig {
  geometry: Plane;
  gl: GL;
  sharedTexture: SharedTexture;
  index: number;
  length: number;
  scene: Transform;
  screen: ScreenSize;
  text: string;
  viewport: Viewport;
  bend: number;
  textColor: string;
  borderRadius: number;
  font: string;
  reduceMotion: boolean;
  invalidate: () => void;
}

class GalleryMedia {
  readonly gl: GL;
  readonly geometry: Plane;
  sharedTexture: SharedTexture;
  readonly index: number;
  readonly length: number;
  readonly scene: Transform;
  readonly bend: number;
  readonly reduceMotion: boolean;
  readonly invalidate: () => void;
  readonly program: Program;
  readonly plane: Mesh;
  readonly title: GalleryTitle;
  screen: ScreenSize;
  viewport: Viewport;
  extra = 0;
  width = 0;
  widthTotal = 0;
  x = 0;
  destroyed = false;

  constructor(config: GalleryMediaConfig) {
    this.gl = config.gl;
    this.geometry = config.geometry;
    this.sharedTexture = config.sharedTexture;
    this.index = config.index;
    this.length = config.length;
    this.scene = config.scene;
    this.screen = config.screen;
    this.viewport = config.viewport;
    this.bend = config.bend;
    this.reduceMotion = config.reduceMotion;
    this.invalidate = config.invalidate;
    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float distortion = min(abs(uSpeed) * 4.0, 0.35);
          p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * distortion;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        varying vec2 vUv;

        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }

        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);
          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          float alpha = 1.0 - smoothstep(-0.002, 0.002, d);
          gl_FragColor = vec4(color.rgb, alpha);
        }
      `,
      uniforms: {
        tMap: { value: this.sharedTexture.texture },
        uPlaneSizes: { value: [1, 1] },
        uImageSizes: { value: [96, 72] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uBorderRadius: { value: config.borderRadius }
      },
      transparent: true
    });
    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);
    this.title = new GalleryTitle(this.gl, this.plane, config.text, config.textColor, config.font);
    this.onResize();
    void this.sharedTexture.loaded.then((image) => {
      if (!image || this.destroyed) return;
      this.program.uniforms.uImageSizes.value = [image.naturalWidth, image.naturalHeight];
      this.invalidate();
    });
  }

  updateTexture(sharedTexture: SharedTexture): void {
    if (this.sharedTexture === sharedTexture) return;
    this.sharedTexture = sharedTexture;
    this.program.uniforms.tMap.value = sharedTexture.texture;
    const placeholder = sharedTexture.texture.image as HTMLCanvasElement | HTMLImageElement | undefined;
    if (placeholder) this.program.uniforms.uImageSizes.value = [placeholder.width, placeholder.height];
    void sharedTexture.loaded.then((image) => {
      if (!image || this.destroyed || this.sharedTexture !== sharedTexture) return;
      this.program.uniforms.uImageSizes.value = [image.naturalWidth, image.naturalHeight];
      this.invalidate();
    });
    this.invalidate();
  }

  update(scroll: { current: number; last: number }, direction: Direction): void {
    this.plane.position.x = this.x - scroll.current - this.extra;
    const position = this.plane.position.x;
    const halfViewport = this.viewport.width / 2;
    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const bend = Math.abs(this.bend);
      const radius = (halfViewport * halfViewport + bend * bend) / (2 * bend);
      const effectiveX = Math.min(Math.abs(position), halfViewport);
      const arc = radius - Math.sqrt(radius * radius - effectiveX * effectiveX);
      this.plane.position.y = this.bend > 0 ? -arc : arc;
      this.plane.rotation.z = (this.bend > 0 ? -1 : 1) * Math.sign(position) * Math.asin(effectiveX / radius);
    }
    const speed = this.reduceMotion ? 0 : scroll.current - scroll.last;
    if (!this.reduceMotion && Math.abs(speed) > SCROLL_SETTLE_EPSILON) {
      this.program.uniforms.uTime.value += 0.04;
    }
    this.program.uniforms.uSpeed.value = speed;
    const planeOffset = this.plane.scale.x / 2;
    const before = this.plane.position.x + planeOffset < -halfViewport;
    const after = this.plane.position.x - planeOffset > halfViewport;
    if (direction === "right" && before) this.extra -= this.widthTotal;
    if (direction === "left" && after) this.extra += this.widthTotal;
  }

  onResize({ screen, viewport }: { screen?: ScreenSize; viewport?: Viewport } = {}): void {
    if (screen) this.screen = screen;
    if (viewport) this.viewport = viewport;
    const scale = this.screen.height / 1500;
    this.plane.scale.y = (this.viewport.height * (900 * scale)) / this.screen.height;
    this.plane.scale.x = (this.viewport.width * (700 * scale)) / this.screen.width;
    this.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    this.width = this.plane.scale.x + 2;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
    this.title.resize(this.plane);
  }

  destroy(): void {
    this.destroyed = true;
    this.title.destroy();
    this.program.remove();
  }
}

interface GalleryAppConfig {
  items: ReactBitsCircularGalleryItem[];
  activeIndex: number;
  bend: number;
  textColor: string;
  borderRadius: number;
  font: string;
  scrollSpeed: number;
  scrollEase: number;
  reduceMotion: boolean;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
  onActiveHoverChange: (hovered: boolean) => void;
  onReady: () => void;
}

class CircularGalleryApp {
  readonly container: HTMLElement;
  readonly itemCount: number;
  readonly scrollSpeed: number;
  readonly reduceMotion: boolean;
  readonly renderer: Renderer;
  readonly gl: GL;
  readonly camera: Camera;
  readonly raycast = new Raycast();
  readonly scene: Transform;
  readonly planeGeometry: Plane;
  readonly medias: GalleryMedia[];
  readonly texturePool = new Map<string, SharedTexture>();
  readonly resizeObserver: ResizeObserver;
  scroll: { ease: number; current: number; target: number; last: number; position: number };
  screen: ScreenSize = { width: 1, height: 1 };
  viewport: Viewport = { width: 1, height: 1 };
  raf = 0;
  snapTimer: number | null = null;
  pointer: { id: number; startX: number; startY: number; moved: boolean } | null = null;
  pointerPosition: { x: number; y: number } | null = null;
  activeIndex: number;
  activeCardHovered = false;
  onActiveIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
  onActiveHoverChange: (hovered: boolean) => void;
  destroyed = false;
  ready = false;
  paused = false;

  constructor(container: HTMLElement, config: GalleryAppConfig) {
    this.container = container;
    this.itemCount = config.items.length;
    this.scrollSpeed = config.scrollSpeed;
    this.reduceMotion = config.reduceMotion;
    this.activeIndex = config.activeIndex;
    this.onActiveIndexChange = config.onActiveIndexChange;
    this.onOpen = config.onOpen;
    this.onActiveHoverChange = config.onActiveHoverChange;
    this.scroll = {
      ease: this.reduceMotion ? 1 : config.scrollEase,
      current: 0,
      target: 0,
      last: 0,
      position: 0
    };
    this.renderer = new Renderer({
      alpha: false,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0.035, 0.039, 0.043, 1);
    this.gl.canvas.classList.add("circular-gallery__canvas");
    this.container.appendChild(this.gl.canvas);
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
    this.scene = new Transform();
    this.resize();
    this.planeGeometry = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 });
    const doubledItems = config.items.concat(config.items);
    this.medias = doubledItems.map((item, index) => new GalleryMedia({
      geometry: this.planeGeometry,
      gl: this.gl,
      sharedTexture: this.getTexture(item.image, index),
      index,
      length: doubledItems.length,
      scene: this.scene,
      screen: this.screen,
      text: item.text,
      viewport: this.viewport,
      bend: config.bend,
      textColor: config.textColor,
      borderRadius: config.borderRadius,
      font: config.font,
      reduceMotion: config.reduceMotion,
      invalidate: this.requestRender
    }));
    this.setActiveIndex(config.activeIndex, true);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.container);
    this.addEventListeners();
    this.renderFrame();
    config.onReady();
  }

  getTexture(url: string, index: number): SharedTexture {
    const cached = this.texturePool.get(url);
    if (cached) return cached;
    const texture = new Texture(this.gl, { generateMipmaps: true });
    texture.image = createPlaceholderCanvas(index);
    const loaded = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!this.destroyed) {
          texture.image = image;
          this.requestRender();
        }
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    const shared = { texture, loaded };
    this.texturePool.set(url, shared);
    return shared;
  }

  updateItems(items: ReactBitsCircularGalleryItem[]): void {
    if (items.length !== this.itemCount) return;
    this.medias.forEach((media, index) => {
      const item = items[index % this.itemCount];
      media.updateTexture(this.getTexture(item.image, index));
    });
    this.requestRender();
  }

  requestRender = (): void => {
    if (this.destroyed || document.hidden || this.paused || this.raf !== 0) return;
    this.raf = window.requestAnimationFrame(this.renderFrame);
  };

  resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.screen = { width, height };
    this.renderer.setSize(width, height);
    this.camera.perspective({ aspect: width / height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const viewportHeight = 2 * Math.tan(fov / 2) * this.camera.position.z;
    this.viewport = { width: viewportHeight * this.camera.aspect, height: viewportHeight };
    this.medias?.forEach((media) => media.onResize({ screen: this.screen, viewport: this.viewport }));
    if (this.medias) this.requestRender();
  };

  renderFrame = (): void => {
    this.raf = 0;
    if (this.destroyed || document.hidden || this.paused) return;
    const next = this.reduceMotion
      ? this.scroll.target
      : lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const settled = Math.abs(this.scroll.target - next) <= SCROLL_SETTLE_EPSILON;
    this.scroll.current = settled ? this.scroll.target : next;
    if (settled && Math.abs(this.scroll.current - this.scroll.last) <= SCROLL_SETTLE_EPSILON) {
      this.scroll.last = this.scroll.current;
    }
    const direction: Direction = this.scroll.current > this.scroll.last ? "right" : "left";
    const moving = Math.abs(this.scroll.current - this.scroll.last) > SCROLL_SETTLE_EPSILON;
    this.medias.forEach((media) => media.update(this.scroll, direction));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    if (!this.pointer && this.pointerPosition) {
      this.updateActiveCardHover(this.pointerPosition.x, this.pointerPosition.y);
    }
    this.scroll.last = this.scroll.current;
    if (!settled || moving) this.requestRender();
  };

  resume = (): void => {
    if (this.destroyed || document.hidden || this.paused || this.raf !== 0) return;
    this.requestRender();
  };

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      if (this.raf !== 0) window.cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.resume();
    }
  }

  notifyActiveIndex(): void {
    const width = this.medias[0]?.width;
    if (!width || this.itemCount === 0) return;
    const index = modulo(Math.round(this.scroll.target / width), this.itemCount);
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.onActiveIndexChange(index);
  }

  snap = (): void => {
    const width = this.medias[0]?.width;
    if (!width) return;
    this.scroll.target = Math.round(this.scroll.target / width) * width;
    this.notifyActiveIndex();
    this.requestRender();
  };

  scheduleSnap(): void {
    if (this.snapTimer !== null) window.clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(this.snap, 180);
  }

  setActiveIndex(index: number, immediate = false): void {
    const width = this.medias[0]?.width;
    if (!width || this.itemCount === 0) return;
    const desired = modulo(index, this.itemCount);
    const currentRaw = Math.round(this.scroll.target / width);
    const current = modulo(currentRaw, this.itemCount);
    let delta = desired - current;
    if (delta > this.itemCount / 2) delta -= this.itemCount;
    if (delta < -this.itemCount / 2) delta += this.itemCount;
    this.scroll.target = (currentRaw + delta) * width;
    this.activeIndex = desired;
    if (immediate || this.reduceMotion) {
      this.scroll.current = this.scroll.target;
      this.scroll.last = this.scroll.target;
    }
    this.requestRender();
  }

  handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    this.scroll.target += (delta > 0 ? this.scrollSpeed : -this.scrollSpeed) * 0.2;
    this.requestRender();
    this.scheduleSnap();
  };

  handlePointerDown = (event: PointerEvent): void => {
    this.pointerPosition = { x: event.clientX, y: event.clientY };
    this.setActiveCardHovered(false);
    this.pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    this.scroll.position = this.scroll.current;
    this.container.setPointerCapture(event.pointerId);
  };

  handlePointerMove = (event: PointerEvent): void => {
    this.pointerPosition = { x: event.clientX, y: event.clientY };
    if (!this.pointer || this.pointer.id !== event.pointerId) {
      this.updateActiveCardHover(event.clientX, event.clientY);
      return;
    }
    const distance = this.pointer.startX - event.clientX;
    this.pointer.moved ||= Math.abs(distance) > 5;
    this.scroll.target = this.scroll.position + distance * (this.scrollSpeed * 0.025);
    this.requestRender();
  };

  handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    const moved = this.pointer.moved || Math.hypot(
      event.clientX - this.pointer.startX,
      event.clientY - this.pointer.startY
    ) > 6;
    this.pointer = null;
    if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
    this.snap();
    if (!moved) this.activateClickedMedia(event.clientX, event.clientY);
  };

  activateClickedMedia(clientX: number, clientY: number): void {
    const media = this.mediaAt(clientX, clientY);
    if (!media) return;
    const clickedIndex = modulo(media.index, this.itemCount);
    if (clickedIndex === this.activeIndex) {
      this.onOpen(clickedIndex);
      return;
    }
    this.setActiveIndex(clickedIndex);
    this.onActiveIndexChange(clickedIndex);
  }

  mediaAt(clientX: number, clientY: number): GalleryMedia | null {
    const bounds = this.container.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const pointer: [number, number] = [
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    ];
    this.raycast.castMouse(this.camera, pointer);
    const hits = this.raycast.intersectBounds(this.medias.map((media) => media.plane));
    const hit = hits[0];
    return hit ? this.medias.find((candidate) => candidate.plane === hit) ?? null : null;
  }

  setActiveCardHovered(hovered: boolean): void {
    if (hovered === this.activeCardHovered) return;
    this.activeCardHovered = hovered;
    this.onActiveHoverChange(hovered);
  }

  updateActiveCardHover(clientX: number, clientY: number): void {
    const media = this.mediaAt(clientX, clientY);
    const centered = Boolean(media) && Math.abs(media!.plane.position.x) <= media!.width * 0.08;
    this.setActiveCardHovered(centered && modulo(media!.index, this.itemCount) === this.activeIndex);
  }

  handlePointerLeave = (): void => {
    this.pointerPosition = null;
    this.setActiveCardHovered(false);
  };

  handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nextIndex = modulo(
        this.activeIndex + (event.key === "ArrowRight" ? 1 : -1),
        this.itemCount
      );
      this.setActiveIndex(nextIndex);
      this.onActiveIndexChange(nextIndex);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.onOpen(this.activeIndex);
    }
  };

  handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (this.paused || document.hidden || event.defaultPrevented || event.target === this.container) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
    this.handleKeyDown(event);
  };

  handleVisibility = (): void => {
    if (document.hidden) {
      if (this.raf !== 0) window.cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.resume();
    }
  };

  addEventListeners(): void {
    this.container.addEventListener("wheel", this.handleWheel, { passive: false });
    this.container.addEventListener("pointerdown", this.handlePointerDown);
    this.container.addEventListener("pointermove", this.handlePointerMove);
    this.container.addEventListener("pointerup", this.handlePointerUp);
    this.container.addEventListener("pointercancel", this.handlePointerUp);
    this.container.addEventListener("pointerleave", this.handlePointerLeave);
    this.container.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keydown", this.handleWindowKeyDown);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  updateCallbacks(
    onActiveIndexChange: (index: number) => void,
    onOpen: (index: number) => void,
    onActiveHoverChange: (hovered: boolean) => void
  ): void {
    this.onActiveIndexChange = onActiveIndexChange;
    this.onOpen = onOpen;
    this.onActiveHoverChange = onActiveHoverChange;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.snapTimer !== null) window.clearTimeout(this.snapTimer);
    if (this.raf !== 0) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver.disconnect();
    this.container.removeEventListener("wheel", this.handleWheel);
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.container.removeEventListener("pointerup", this.handlePointerUp);
    this.container.removeEventListener("pointercancel", this.handlePointerUp);
    this.container.removeEventListener("pointerleave", this.handlePointerLeave);
    this.container.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keydown", this.handleWindowKeyDown);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.medias.forEach((media) => media.destroy());
    this.planeGeometry.remove();
    this.texturePool.forEach(({ texture }) => this.gl.deleteTexture(texture.texture));
    this.texturePool.clear();
    this.gl.canvas.remove();
  }
}

export function ReactBitsCircularGallery({
  items,
  activeIndex,
  onActiveIndexChange,
  onOpen,
  onActiveHoverChange,
  onReady,
  onWebGLUnavailable,
  bend = 3,
  textColor = "#ffffff",
  borderRadius = 0.05,
  font = "600 24px system-ui",
  scrollSpeed = 2,
  scrollEase = 0.05,
  reduceMotion = false,
  paused = false
}: ReactBitsCircularGalleryProps): React.ReactElement {
  const uiText = useUiText();

  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<CircularGalleryApp | null>(null);
  const itemsRef = useRef(items);
  const activeIndexRef = useRef(activeIndex);
  const callbacksRef = useRef({ onActiveIndexChange, onOpen, onActiveHoverChange, onReady, onWebGLUnavailable });
  const itemStructureSignature = items.map((item) => `${item.id}:${item.text}`).join("|");
  const itemImageSignature = items.map((item) => `${item.id}:${item.image}`).join("|");
  itemsRef.current = items;
  activeIndexRef.current = activeIndex;
  callbacksRef.current = { onActiveIndexChange, onOpen, onActiveHoverChange, onReady, onWebGLUnavailable };

  useEffect(() => {
    const container = containerRef.current;
    const currentItems = itemsRef.current;
    if (!container || currentItems.length === 0) return;
    let app: CircularGalleryApp | null = null;
    try {
      app = new CircularGalleryApp(container, {
        items: currentItems,
        activeIndex: activeIndexRef.current,
        bend,
        textColor,
        borderRadius,
        font,
        scrollSpeed,
        scrollEase,
        reduceMotion,
        onActiveIndexChange: (index) => callbacksRef.current.onActiveIndexChange(index),
        onOpen: (index) => callbacksRef.current.onOpen(index),
        onActiveHoverChange: (hovered) => callbacksRef.current.onActiveHoverChange?.(hovered),
        onReady: () => callbacksRef.current.onReady?.()
      });
      appRef.current = app;
    } catch {
      callbacksRef.current.onWebGLUnavailable?.();
    }
    return () => {
      app?.destroy();
      if (appRef.current === app) appRef.current = null;
    };
  }, [bend, borderRadius, font, itemStructureSignature, reduceMotion, scrollEase, scrollSpeed, textColor]);

  useEffect(() => {
    appRef.current?.updateItems(itemsRef.current);
  }, [itemImageSignature]);

  useEffect(() => {
    appRef.current?.updateCallbacks(
      onActiveIndexChange,
      onOpen,
      (hovered) => onActiveHoverChange?.(hovered)
    );
  }, [onActiveHoverChange, onActiveIndexChange, onOpen]);

  useEffect(() => {
    appRef.current?.setActiveIndex(activeIndex);
  }, [activeIndex]);

  useEffect(() => {
    appRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <div
      className="circular-gallery"
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={uiText("生成记录环形画廊，使用左右方向键浏览")}
    />
  );
}
