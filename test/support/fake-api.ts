// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The develop store is a zustand store holding the photo's param bag, so the
// panel and the overlay re-render when it changes, and each commitEdit is
// recorded. Core's Slider is a stub that keeps the props it was last drawn
// with, so a test can drive a drag and its release. The UI kit pieces are
// plain DOM. The canvas tool is held by whoever set it last, as core's is,
// and the overlay mapping is a 400 × 200 image at the overlay's origin.

import * as React from "react";
import { create } from "zustand";
import type {
  ButtonProps,
  CanvasTool,
  DevelopOverlayState,
  KeyActionContribution,
  PanelContribution,
  ProcessingStageContribution,
  RowProps,
  SafelightAPI,
  SliderProps,
  StackProps,
  ToggleProps,
} from "../../src/safelight";
import { EXT_ID } from "../../src/params";

/** The members of SafelightAPI this fake implements, typed against the real thing. */
type FakeMembers = Pick<
  SafelightAPI,
  | "version"
  | "extensionId"
  | "react"
  | "registerPanel"
  | "registerProcessingStage"
  | "unregisterProcessingStage"
  | "registerKeybinding"
> & {
  navigation: Pick<SafelightAPI["navigation"], "current">;
  components: Pick<SafelightAPI["components"], "Slider">;
  develop: Pick<
    SafelightAPI["develop"],
    "setCanvasTool" | "useCanvasToolHeld" | "setCanvasCursor" | "useDevelopOverlay" | "brush" | "BrushCursor" | "framePoint"
  >;
  ui: Pick<SafelightAPI["ui"], "Button" | "Row" | "Stack" | "Toggle" | "tokens">;
  stores: Pick<SafelightAPI["stores"], "create" | "useDevelopStore">;
  keybindings: Pick<SafelightAPI["keybindings"], "getBinding">;
};

export interface FakeDevelop {
  photoId: string | null;
  paramBag: Record<string, unknown>;
  setDynParam(key: string, value: unknown): void;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export const IMAGE = { w: 400, h: 200 };

/** The official brush's defaults as the fake hands them out; not the extension's own. */
export const BRUSH_DEFAULTS = Object.freeze({ size: 0.07, feather: 0.4, opacity: 0.9, flow: 0.8 });

type BrushSetting = keyof typeof BRUSH_DEFAULTS;

// A stand-in for core's step table: one step up per setting, enough to show
// the extension hands its settings to core and applies what comes back.
const BRUSH_STEPS: Record<string, { key: BrushSetting; by: number }> = {
  "brush.larger": { key: "size", by: 0.01 },
  "brush.smaller": { key: "size", by: -0.01 },
  "brush.featherUp": { key: "feather", by: 0.05 },
  "brush.opacityUp": { key: "opacity", by: 0.1 },
  "brush.flowUp": { key: "flow", by: 0.1 },
};

function stepBrush(action: string, brush: Partial<Record<BrushSetting, number>>) {
  const s = BRUSH_STEPS[action];
  const now = s ? brush[s.key] : undefined;
  return s && now !== undefined ? { key: s.key, value: now + s.by } : null;
}

export interface BrushCursorSeen {
  at: { x: number; y: number } | "centre" | null;
  size: number;
  feather: number;
  erase?: boolean;
}

export interface Rig {
  api: SafelightAPI;
  panels: PanelContribution[];
  stages: ProcessingStageContribution[];
  keybindings: KeyActionContribution[];
  /** The photo's param bag, by qualified key, without defaults. */
  params(): Readonly<Record<string, unknown>>;
  /** The labels of the undo steps the extension made, in order. */
  commits: string[];
  /** The latest props of each slider drawn in `root`, in document order. */
  sliders(root: ParentNode): SliderProps[];
  unregistered: string[];
  /** The canvas tool this extension holds now, or null. */
  tool(): CanvasTool | null;
  /** Another tool (crop, masks) takes the canvas. */
  takeCanvas(): void;
  /** What the official brush ring was last drawn with, if it is showing. */
  brushCursor(): BrushCursorSeen | null;
  /** The canvas cursors asked for and not yet released, the latest last. */
  cursors: string[];
  develop: { setState(patch: Partial<FakeDevelop>): void };
  ui: { setState(patch: { activeModule: string }): void };
}

export function fakeApi(initial: Record<string, unknown> = {}): Rig {
  const panels: PanelContribution[] = [];
  const stages: ProcessingStageContribution[] = [];
  const keybindings: KeyActionContribution[] = [];
  const commits: string[] = [];
  const unregistered: string[] = [];
  const cursors: string[] = [];
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;
  let cursorSeen: BrushCursorSeen | null = null;

  function BrushCursor(props: BrushCursorSeen) {
    cursorSeen = props.at === null ? null : { ...props };
    return null;
  }

  const develop = create<FakeDevelop>()((set) => ({
    photoId: "photo-1",
    paramBag: { ...initial },
    setDynParam: (key, value) => set((s) => ({ paramBag: { ...s.paramBag, [key]: value } })),
    setDynParams: (patch) => set((s) => ({ paramBag: { ...s.paramBag, ...patch } })),
    commitEdit: async (label) => void commits.push(label),
  }));
  const uiStore = create<{ activeModule: string }>()(() => ({ activeModule: "develop" }));
  const canvas = create<{ held: CanvasTool | null; owner: string | null }>()(() => ({ held: null, owner: null }));

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  const geometry: DevelopOverlayState = {
    rect: { x: 0, y: 0, w: IMAGE.w, h: IMAGE.h },
    imageRect: { x: 0, y: 0, w: IMAGE.w, h: IMAGE.h },
    nonce: 0,
    toScreen: (u, v) => ({ x: u * IMAGE.w, y: v * IMAGE.h }),
    toImage: (x, y) => ({ x: x / IMAGE.w, y: y / IMAGE.h }),
    radiusToScreen: (r) => r * IMAGE.h,
    radiusToImage: (px) => px / IMAGE.h,
    region: { x: 0, y: 0, width: 1, height: 1 },
    imageAspect: IMAGE.w / IMAGE.h,
    zoomScale: 1,
  };

  const members: FakeMembers = {
    version: 1,
    extensionId: EXT_ID,
    react: React,
    registerPanel: (c) => void panels.push(c),
    registerProcessingStage: (c) => void stages.push(c),
    unregisterProcessingStage: (id) => void unregistered.push(id),
    registerKeybinding: (c) => void keybindings.push(c),
    components: { Slider },
    develop: {
      setCanvasTool: (tool) => canvas.setState(tool ? { held: tool, owner: EXT_ID } : { held: null, owner: null }),
      useCanvasToolHeld: () => canvas((s) => s.owner === EXT_ID && s.held !== null),
      setCanvasCursor: (cursor) => {
        const name = typeof cursor === "string" ? cursor : String(cursor);
        cursors.push(name);
        return () => {
          const i = cursors.lastIndexOf(name);
          if (i >= 0) cursors.splice(i, 1);
        };
      },
      useDevelopOverlay: () => geometry,
      brush: { defaults: BRUSH_DEFAULTS, actions: Object.keys(BRUSH_STEPS), step: stepBrush },
      BrushCursor,
      framePoint: (el, clientX, clientY) => {
        const r = el.getBoundingClientRect();
        return { x: clientX - r.left, y: clientY - r.top };
      },
    },
    ui: ui as unknown as FakeMembers["ui"],
    navigation: { current: () => uiStore.getState().activeModule },
    stores: {
      create,
      useDevelopStore: develop as unknown as SafelightAPI["stores"]["useDevelopStore"],
    },
    keybindings: { getBinding: (id) => keybindings.find((k) => k.id === id)?.defaultCombo ?? "" },
  };

  return {
    api: strict(members, "api") as unknown as SafelightAPI,
    panels,
    stages,
    keybindings,
    params: () => develop.getState().paramBag,
    commits,
    unregistered,
    cursors,
    brushCursor: () => cursorSeen,
    tool: () => {
      const s = canvas.getState();
      return s.owner === EXT_ID ? s.held : null;
    },
    takeCanvas: () => canvas.setState({ held: { overlay: () => null }, owner: "another" }),
    develop: { setState: (patch) => develop.setState(patch) },
    ui: { setState: (patch) => uiStore.setState(patch) },
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
  };
}

const e = React.createElement;

const ui = {
  tokens: { surface2: "var(--color-surface-2)" },
  Button: ({ active, size: _size, variant: _variant, full: _full, ...rest }: ButtonProps) =>
    e("button", { ...rest, "data-active": active ? "true" : "false" }),
  Row: (props: RowProps) => e("div", null, props.children),
  Stack: (props: StackProps) => e("div", null, props.children),
  Toggle: (props: ToggleProps) =>
    e(
      "label",
      null,
      props.label,
      e("input", { type: "checkbox", checked: props.checked, onChange: (ev: React.ChangeEvent<HTMLInputElement>) => props.onChange(ev.target.checked) }),
    ),
};

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
