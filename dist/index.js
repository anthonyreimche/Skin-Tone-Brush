//#region src/brush.ts
var e = .25;
function t(e, t, n, r) {
	return {
		x: e.x,
		y: e.y,
		radius: t.brushSize,
		erase: n || t.brushErase,
		feather: t.brushFeather,
		opacity: t.brushOpacity,
		flow: t.brushFlow,
		...r ? { strokeStart: !0 } : {}
	};
}
function n(e, t, n) {
	return Math.hypot((t.x - e.x) * n, t.y - e.y);
}
function r(t, r, i, a) {
	return n(t, r, a) >= i.brushSize * e;
}
function i(r, i, a, o, s) {
	let c = Math.max(1, Math.ceil(n(r, i, o) / (a.brushSize * e))), l = [];
	for (let e = 1; e <= c; e++) {
		let n = e / c;
		l.push(t({
			x: r.x + (i.x - r.x) * n,
			y: r.y + (i.y - r.y) * n
		}, a, s, e === 1));
	}
	return l;
}
//#endregion
//#region src/params.ts
var a = "skin-tone-brush", o = `${a}.smooth`, s = `${a}.panel`, c = `${a}.paint`, l = [
	{
		key: "smoothing",
		label: "Smoothing",
		min: 0,
		max: 100,
		default: 50,
		history: "Skin Smoothing"
	},
	{
		key: "smoothSize",
		label: "Smoothing size",
		min: 0,
		max: 100,
		default: 50,
		history: "Skin Smoothing Size"
	},
	{
		key: "textureAmount",
		label: "Texture",
		min: 0,
		max: 150,
		default: 100,
		history: "Skin Texture"
	},
	{
		key: "textureSize",
		label: "Texture size",
		min: 0,
		max: 100,
		default: 50,
		history: "Skin Texture Size"
	}
], u = {
	smoothing: 50,
	smoothSize: 50,
	textureAmount: 100,
	textureSize: 50
}, d = (e) => `${o}.${e}`, f = "mask", p = "maskOn", m = {
	mask: d(f),
	maskOn: d(p),
	smoothing: d("smoothing"),
	smoothSize: d("smoothSize"),
	textureAmount: d("textureAmount"),
	textureSize: d("textureSize")
}, h = (e) => typeof e == "number" && Number.isFinite(e);
function g(e) {
	let t = { ...u };
	for (let n of l) {
		let r = e[m[n.key]];
		h(r) && (t[n.key] = Math.min(n.max, Math.max(n.min, r)));
	}
	return t;
}
function _(e) {
	return Object.fromEntries(l.map((t) => [m[t.key], e[t.key]]));
}
//#endregion
//#region src/rt.ts
var v, y;
function b(e) {
	y = e, v = e.react;
}
//#endregion
//#region src/persistence.ts
var x = (e) => typeof e == "number" && Number.isFinite(e);
function S(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return x(t.x) && x(t.y) && x(t.radius) && x(t.feather) && x(t.opacity) && x(t.flow) && typeof t.erase == "boolean";
}
function C(e) {
	let t = e[m.mask];
	return Array.isArray(t) && t.every(S) ? t : [];
}
var w = (e) => e.some((e) => !e.erase);
function T(e) {
	return {
		[m.mask]: [...e],
		[m.maskOn]: +!!w(e)
	};
}
function E() {
	return y.stores.useDevelopStore.getState();
}
function D(e) {
	let t = E();
	t.setDynParams(T([...C(t.paramBag), ...e]));
}
function O() {
	return E().commitEdit("Skin Brush Stroke");
}
async function k() {
	let e = E();
	e.setDynParams(T([])), await e.commitEdit("Clear Skin Brush");
}
function A(e, t) {
	E().setDynParam(m[e], t);
}
function j(e) {
	let t = l.find((t) => t.key === e);
	return E().commitEdit(t?.history ?? "Skin Tone Brush");
}
async function M() {
	let e = E();
	e.setDynParams({
		..._(u),
		...T([])
	}), await e.commitEdit("Reset Skin Tone Brush");
}
//#endregion
//#region src/store.ts
var N = null;
function P() {
	return N = y.stores.create()((e) => ({
		brushSize: y.develop.brush.defaults.size,
		brushFeather: y.develop.brush.defaults.feather,
		brushOpacity: y.develop.brush.defaults.opacity,
		brushFlow: y.develop.brush.defaults.flow,
		brushErase: !1,
		armed: !1,
		showMask: !0,
		brushPreview: !1,
		setArmed: (t) => e({ armed: t }),
		toggleArmed: () => e((e) => ({ armed: !e.armed })),
		setShowMask: (t) => e({ showMask: t }),
		setBrush: (t) => e(t),
		setBrushPreview: (t) => e({ brushPreview: t })
	})), N;
}
function F() {
	if (!N) throw Error("[skin-tone-brush] store used before activate()");
	return N;
}
//#endregion
//#region src/wash.ts
var I = "230, 64, 64", ee = .5;
function L(e, t) {
	let n = t.radiusToScreen(e.radius);
	if (n < .3) return null;
	let { x: r, y: i } = t.toScreen(e.x, e.y);
	return {
		x: r,
		y: i,
		r: n
	};
}
function R(e, t, n) {
	e.setTransform(1, 0, 0, 1, 0, 0);
	for (let r of t) {
		let t = L(r, n);
		if (!t) continue;
		let i = Math.max(0, Math.min(1, 1 - r.feather)), a = Math.max(0, Math.min(1, r.flow * (r.erase ? 1 : r.opacity))), o = e.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
		o.addColorStop(0, `rgba(${I}, ${a})`), o.addColorStop(i, `rgba(${I}, ${a})`), o.addColorStop(1, `rgba(${I}, 0)`), e.globalCompositeOperation = r.erase ? "destination-out" : "source-over", e.fillStyle = o, e.beginPath(), e.arc(t.x, t.y, t.r, 0, Math.PI * 2), e.fill();
	}
	e.globalCompositeOperation = "source-over";
}
function te(e, t, n, r, i) {
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.clearRect(0, 0, r, i), R(e, t, n);
}
function ne(e, t) {
	if (t.length < e.length) return null;
	for (let n = 0; n < e.length; n++) if (t[n] !== e[n]) return null;
	return t.slice(e.length);
}
//#endregion
//#region src/Overlay.tsx
var z = {
	size: "brushSize",
	feather: "brushFeather",
	opacity: "brushOpacity",
	flow: "brushFlow"
};
function B(e) {
	let { brushSize: t, brushFeather: n, brushOpacity: r, brushFlow: i, brushErase: a } = e;
	return {
		brushSize: t,
		brushFeather: n,
		brushOpacity: r,
		brushFlow: i,
		brushErase: a
	};
}
function V() {
	let e = y.stores.useDevelopStore, n = F()((e) => e.armed), a = F()((e) => e.showMask), o = F()((e) => e.brushSize), s = F()((e) => e.brushFeather), c = F()((e) => e.brushErase), l = F()((e) => e.brushPreview), u = e((e) => e.photoId), d = e((e) => e.paramBag[m.mask]), { rect: f, nonce: p, toImage: h, toScreen: g, radiusToScreen: _, imageAspect: b } = y.develop.useDevelopOverlay(), [x, S] = v.useState(!1), [w, T] = v.useState(null), E = v.useRef(null), k = v.useRef(null), A = v.useRef(null), j = v.useRef(null), M = v.useRef(null), N = n && !!f && !!u && !!h && !!g && !!_;
	v.useEffect(() => {
		if (N) return y.develop.setCanvasCursor("crosshair", { priority: 20 });
	}, [N]), v.useEffect(() => {
		j.current = null, M.current = null;
	}, [u]), v.useEffect(() => {
		let t = k.current, n = E.current;
		if (!N || !a || !t || !n || !g || !_) return;
		let r = Math.max(1, Math.round(n.clientWidth)), i = Math.max(1, Math.round(n.clientHeight));
		(t.width !== r || t.height !== i) && (t.width = r, t.height = i, A.current = null);
		let o = t.getContext("2d");
		if (!o) return;
		let s = C(e.getState().paramBag), c = {
			toScreen: g,
			radiusToScreen: _
		}, l = A.current, u = l && l.canvas === t && l.nonce === p && l.toScreen === g && l.radiusToScreen === _ ? ne(l.dabs, s) : null;
		u ? R(o, u, c) : te(o, s, c, r, i), A.current = {
			canvas: t,
			dabs: s,
			nonce: p,
			toScreen: g,
			radiusToScreen: _
		};
	}, [
		N,
		a,
		p,
		d,
		g,
		_,
		e
	]);
	let P = (e) => {
		if (!N || e.button !== 0 || !h) return;
		let n = y.develop.framePoint(e.currentTarget, e.clientX, e.clientY), r = h(n.x, n.y);
		e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId);
		let a = B(F().getState());
		D(e.shiftKey && M.current ? i(M.current, r, a, b, e.altKey) : [t(r, a, e.altKey, !0)]), M.current = r, j.current = { last: r }, T(n);
	}, I = (e) => {
		if (!N || !h) return;
		let n = y.develop.framePoint(e.currentTarget, e.clientX, e.clientY);
		T(n), S(e.altKey);
		let i = j.current;
		if (!i) return;
		let a = h(n.x, n.y), o = B(F().getState());
		r(i.last, a, o, b) && (D([t(a, o, e.altKey, !1)]), i.last = a, M.current = a);
	}, L = (e) => {
		j.current && (j.current = null, e.currentTarget.hasPointerCapture(e.pointerId) && e.currentTarget.releasePointerCapture(e.pointerId), O());
	};
	if (!N) return null;
	let z = x || c;
	return /* @__PURE__ */ v.createElement("div", {
		ref: E,
		"data-testid": "skin-tone-brush-overlay",
		onPointerDown: P,
		onPointerMove: I,
		onPointerUp: L,
		onPointerCancel: L,
		onPointerLeave: () => {
			j.current || T(null);
		},
		style: {
			position: "absolute",
			inset: 0,
			touchAction: "none",
			overflow: "hidden"
		}
	}, a ? /* @__PURE__ */ v.createElement("canvas", {
		ref: k,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			opacity: ee
		}
	}) : null, /* @__PURE__ */ v.createElement(y.develop.BrushCursor, {
		at: l ? "centre" : w,
		size: o,
		feather: s,
		erase: z
	}));
}
function H(e, t) {
	let { brushSize: n, brushFeather: r, brushOpacity: i, brushFlow: a } = F().getState(), o = y.develop.brush.step(e, {
		size: n,
		feather: r,
		opacity: i,
		flow: a
	});
	return o ? (t && F().getState().setBrush({ [z[o.key]]: o.value }), !0) : !1;
}
var re = {
	overlay: V,
	zoomable: !0,
	onEscape: () => F().getState().setArmed(!1),
	onAction: (e) => H(e, !0),
	wants: (e) => H(e, !1)
}, ie = "Alt erase · [ ] size · ⇧[ ] feather · , . opacity · ⇧, ⇧. flow", ae = [
	{
		key: "brushSize",
		label: "Size",
		min: 1,
		max: 50,
		official: "size"
	},
	{
		key: "brushFeather",
		label: "Feather",
		min: 0,
		max: 100,
		official: "feather"
	},
	{
		key: "brushOpacity",
		label: "Opacity",
		min: 1,
		max: 100,
		official: "opacity"
	},
	{
		key: "brushFlow",
		label: "Flow",
		min: 1,
		max: 100,
		official: "flow"
	}
];
function oe() {
	let { Slider: e } = y.components, { Button: t, Toggle: n, Row: r, Stack: i, tokens: a } = y.ui, o = y.stores.useDevelopStore, s = o((e) => e.paramBag), u = F()((e) => e.armed), d = F()((e) => e.showMask), f = F()((e) => e), p = y.develop.useCanvasToolHeld();
	v.useEffect(() => {
		u && !p && F().getState().setArmed(!1);
	}, [u, p]);
	let m = g(s), h = w(C(s)), _ = y.keybindings.getBinding(c), b = [_ ? `Paint over skin (${_})` : "Paint over skin", h ? null : "the sliders act only where you paint"].filter(Boolean).join(": ");
	return /* @__PURE__ */ v.createElement(i, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, /* @__PURE__ */ v.createElement("div", { style: {
		display: "flex",
		flexDirection: "column",
		gap: "1px"
	} }, l.map((t) => /* @__PURE__ */ v.createElement(e, {
		key: t.key,
		label: t.label,
		value: m[t.key],
		min: t.min,
		max: t.max,
		step: 1,
		defaultValue: t.default,
		onChange: (e) => A(t.key, e),
		onCommit: () => void j(t.key)
	}))), /* @__PURE__ */ v.createElement(r, {
		gap: 6,
		style: { marginTop: "4px" }
	}, /* @__PURE__ */ v.createElement(t, {
		size: "sm",
		active: u,
		title: b,
		onClick: () => F().getState().toggleArmed()
	}, u ? "Done" : "Paint"), /* @__PURE__ */ v.createElement(t, {
		size: "sm",
		variant: "ghost",
		disabled: !h,
		onClick: () => void k()
	}, "Clear")), u ? /* @__PURE__ */ v.createElement("div", { title: ie }, /* @__PURE__ */ v.createElement(i, {
		gap: 2,
		style: {
			padding: "6px",
			borderRadius: "4px",
			background: a.surface2
		}
	}, ae.map((t) => /* @__PURE__ */ v.createElement(e, {
		key: t.key,
		label: t.label,
		value: Math.round(f[t.key] * 100),
		min: t.min,
		max: t.max,
		step: 1,
		defaultValue: Math.round(y.develop.brush.defaults[t.official] * 100),
		onChange: (e) => {
			F().getState().setBrush({ [t.key]: e / 100 }), F().getState().setBrushPreview(!0);
		},
		onCommit: () => F().getState().setBrushPreview(!1)
	})), /* @__PURE__ */ v.createElement(r, {
		gap: 12,
		style: { marginTop: "4px" }
	}, /* @__PURE__ */ v.createElement(n, {
		checked: f.brushErase,
		onChange: (e) => F().getState().setBrush({ brushErase: e }),
		label: "Erase"
	}), /* @__PURE__ */ v.createElement(n, {
		checked: d,
		onChange: (e) => F().getState().setShowMask(e),
		label: "Show mask"
	})))) : null);
}
//#endregion
//#region src/model.ts
var se = 4096, U = .5, W = 1e-4, G = {
	min: 1,
	ratio: 20
}, K = {
	min: 4,
	ratio: 16
}, ce = .02, q = .1, J = (e) => Number.isInteger(e) ? `${e}.0` : String(e), Y = (e) => Array.from({ length: 6 }, (e, t) => t + 1).map((t) => `stbTap(p, dir, ${e * t} * stride)`), le = Array.from({ length: 6 }, (e, t) => {
	let n = t + 1, [r, i] = [Y(1)[t], Y(-1)[t]];
	return `    w = exp(-${J(n * n)} / (2.0 * t2));\n    acc += w * (${r} + ${i});\n    wsum += 2.0 * w;`;
}).join("\n"), X = `
ivec2 stbSize() { return ivec2(floor(1.0 / uTexel + 0.5)); }
float stbAnchor() {
  vec2 res = 1.0 / uTexel;
  return max(res.x, res.y) / ${J(se)};
}
float stbSplitRef(float v) { return ${J(G.min)} * pow(${J(G.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
float stbSmoothRef(float v) { return ${J(K.min)} * pow(${J(K.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
float stbSplitVariance(float size) {
  float a = stbAnchor();
  float s = stbSplitRef(size);
  return s * s * a * a;
}
float stbWideVariance(float size, float wide) {
  float a = stbAnchor();
  float s = stbSplitRef(size);
  float e = stbSmoothRef(wide);
  return (s * s + e * e) * a * a;
}
int stbPlan(float v2, out float t2) {
  int n = 0;
  float p = 1.0;
  for (int i = 0; i < 9; i++) {
    float q = p * 4.0;
    if ((q - 1.0) / 3.0 + q * ${J(U)} > v2) break;
    p = q;
    n++;
  }
  t2 = clamp((v2 - (p - 1.0) / 3.0) / p, ${J(W)}, ${J(3)});
  return n;
}
ivec4 stbChainRegion(float v2) {
  float t2;
  int n = stbPlan(v2, t2);
  return uPassIndex / 2 <= n ? ivec4(ivec2(0), stbSize()) : ivec4(0);
}
vec3 stbAt(ivec2 t) { return fetchPrev4(clamp(t, ivec2(0), stbSize() - 1)).rgb; }
vec3 stbTap(ivec2 p, ivec2 dir, int k) { return stbAt(p + dir * k); }
vec3 stbChainDraw(ivec2 p, vec3 own, float v2) {
  float t2;
  int n = stbPlan(v2, t2);
  int level = uPassIndex / 2;
  if (level > n) return own;
  ivec2 dir = uPassIndex - 2 * level == 0 ? ivec2(1, 0) : ivec2(0, 1);
  int stride = 1 << level;
  if (level < n) {
    return 0.375 * own + 0.25 * (${Y(1)[0]} + ${Y(-1)[0]}) + 0.0625 * (${Y(1)[1]} + ${Y(-1)[1]});
  }
  vec3 acc = own;
  float wsum = 1.0;
  float w;
${le}
  return acc / wsum;
}`, ue = "c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbWideVariance(textureSize, smoothSize));", de = "return stbChainRegion(stbWideVariance(textureSize, smoothSize));", fe = "c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbSplitVariance(textureSize));", pe = "return stbChainRegion(stbSplitVariance(textureSize));", me = "\n{\n  ivec2 p = ivec2(gl_FragCoord.xy);\n  ivec2 nb = max(stbSize() / 2, ivec2(1));\n  ivec2 b = min(p / 2, nb - 1) * 2;\n  vec3 e = 0.25 * (stbAt(b) + stbAt(b + ivec2(1, 0)) + stbAt(b + ivec2(0, 1)) + stbAt(b + ivec2(1, 1)));\n  int ch = p.x % 2 + 2 * (p.y % 2);\n  c = vec4(fetchInput(p), ch == 0 ? e.r : (ch == 1 ? e.g : e.b));\n}", he = `
float stbPacked(ivec2 blk, int ch) {
  return fetchPrev4(clamp(blk * 2 + ivec2(ch % 2, ch / 2), ivec2(0), stbSize() - 1)).a;
}
vec3 stbBlock(ivec2 blk) { return vec3(stbPacked(blk, 0), stbPacked(blk, 1), stbPacked(blk, 2)); }
vec3 stbEven(highp ivec2 p) {
  ivec2 nb = max(stbSize() / 2, ivec2(1));
  vec2 u = (vec2(p) - 0.5) * 0.5;
  vec2 i0 = floor(u);
  vec2 fr = u - i0;
  ivec2 a = clamp(ivec2(i0), ivec2(0), nb - 1);
  ivec2 b = clamp(ivec2(i0) + 1, ivec2(0), nb - 1);
  vec3 top = mix(stbBlock(a), stbBlock(ivec2(b.x, a.y)), fr.x);
  vec3 bottom = mix(stbBlock(ivec2(a.x, b.y)), stbBlock(b), fr.x);
  return mix(top, bottom, fr.y);
}
float stbProtection(vec3 d, vec3 low) {
  float ref = max((abs(low.r) + abs(low.g) + abs(low.b)) / 3.0, ${J(ce)});
  float q = dot(d, d) / (3.0 * ref * ref * ${J(q * q)});
  return exp(-q * q);
}`, ge = "\n{\n  ivec2 p = ivec2(gl_FragCoord.xy);\n  vec3 low = c.rgb;\n  vec3 d = stbEven(p) - low;\n  float s = clamp(smoothing, 0.0, 100.0) / 100.0;\n  float k = clamp(textureAmount, 0.0, 150.0) / 100.0;\n  c = vec4(s * stbProtection(d, low) * d + (k - 1.0) * (fetchInput(p) - low), 1.0);\n}", _e = "\nif (maskOn > 0.5) {\n  float cov = mask(srcUv);\n  if (cov > 0.0) lin += cov * stageResult;\n}", Z = (e) => {
	let t = l.find((t) => t.key === e);
	if (!t) throw Error(`no slider ${e}`);
	return {
		key: e,
		glslType: "float",
		default: t.default,
		range: {
			min: t.min,
			max: t.max,
			step: 1
		},
		label: t.label
	};
}, ve = {
	key: p,
	glslType: "float",
	default: 0,
	label: "Painted"
};
function ye() {
	return {
		id: o,
		name: "Skin Tone Brush",
		phase: "decode",
		priority: 900,
		space: { encoding: "perceptual" },
		reads: "current",
		presetScope: "per-image",
		dormantWhen: { [p]: 0 },
		uniforms: [ve],
		textures: [{
			key: f,
			kind: "coverage"
		}],
		passes: [
			{
				glsl: ue,
				helpers: X,
				region: de,
				iterations: 20,
				channels: 4,
				uniforms: [Z("textureSize"), Z("smoothSize")]
			},
			{
				glsl: me,
				helpers: X,
				channels: 4
			},
			{
				glsl: fe,
				helpers: X,
				region: pe,
				iterations: 20,
				channels: 4,
				keep: !0,
				uniforms: [Z("textureSize")]
			},
			{
				glsl: ge,
				helpers: `${X}\n${he}`,
				channels: 4,
				uniforms: [Z("smoothing"), Z("textureAmount")]
			}
		],
		glsl: _e
	};
}
//#endregion
//#region src/index.tsx
var Q = null, $ = null;
function be(e) {
	b(e), P(), Q = e, e.registerProcessingStage(ye()), $ = F().subscribe((t, n) => {
		t.armed !== n.armed && e.develop.setCanvasTool(t.armed ? re : null);
	}), e.registerKeybinding({
		id: c,
		label: "Paint skin smoothing",
		category: "Develop",
		defaultCombo: "Shift+K",
		handler: () => {
			e.navigation.current() === "develop" && e.stores.useDevelopStore.getState().photoId && F().getState().toggleArmed();
		}
	}), e.registerPanel({
		id: s,
		title: "Skin Tone Brush",
		component: oe,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 250
		},
		modules: ["develop"],
		onReset: () => void M()
	});
}
function xe() {
	let e = Q;
	if (e) {
		Q = null;
		try {
			F().getState().setArmed(!1), $?.(), $ = null, e.develop.setCanvasTool(null), e.unregisterProcessingStage(o);
		} catch (e) {
			console.warn("[skin-tone-brush] deactivate failed:", e);
		}
	}
}
//#endregion
export { a as EXT_ID, s as PANEL_ID, be as activate, xe as deactivate };

//# sourceMappingURL=index.js.map