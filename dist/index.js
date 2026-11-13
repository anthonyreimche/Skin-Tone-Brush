//#region src/rt.ts
var e, t;
function n(n) {
	t = n, e = n.react;
}
//#endregion
//#region src/keys.ts
var r = {
	"brush.smaller": {
		key: "brushSize",
		step: -.01,
		min: .01,
		max: .5
	},
	"brush.larger": {
		key: "brushSize",
		step: .01,
		min: .01,
		max: .5
	},
	"brush.featherDown": {
		key: "brushFeather",
		step: -.05,
		min: 0,
		max: 1
	},
	"brush.featherUp": {
		key: "brushFeather",
		step: .05,
		min: 0,
		max: 1
	},
	"brush.opacityDown": {
		key: "brushOpacity",
		step: -.1,
		min: .01,
		max: 1
	},
	"brush.opacityUp": {
		key: "brushOpacity",
		step: .1,
		min: .01,
		max: 1
	},
	"brush.flowDown": {
		key: "brushFlow",
		step: -.1,
		min: .01,
		max: 1
	},
	"brush.flowUp": {
		key: "brushFlow",
		step: .1,
		min: .01,
		max: 1
	}
};
function i(e, t) {
	let n = r[e];
	if (!n) return null;
	let i = Math.round((t[n.key] + n.step) * 100) / 100;
	return { [n.key]: Math.max(n.min, Math.min(n.max, i)) };
}
function a() {
	let e = new URLSearchParams(window.location.search).get("detached");
	return t.stores.useUIStore.getState().activeModule === "develop" || e === "develop";
}
//#endregion
//#region src/brush.ts
var o = .25;
function s(e, t, n, r) {
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
function c(e, t, n) {
	return Math.hypot((t.x - e.x) * n, t.y - e.y);
}
function l(e, t, n, r) {
	return c(e, t, r) >= n.brushSize * o;
}
function u(e, t, n, r, i) {
	let a = Math.max(1, Math.ceil(c(e, t, r) / (n.brushSize * o))), l = [];
	for (let r = 1; r <= a; r++) {
		let o = r / a;
		l.push(s({
			x: e.x + (t.x - e.x) * o,
			y: e.y + (t.y - e.y) * o
		}, n, i, r === 1));
	}
	return l;
}
//#endregion
//#region src/geometry.ts
function d(e, t, n) {
	let r = e.getBoundingClientRect(), i = e.offsetWidth > 0 && r.width > 0 ? r.width / e.offsetWidth : 1;
	return {
		lx: (t - r.left) / i,
		ly: (n - r.top) / i
	};
}
//#endregion
//#region src/params.ts
var f = "skin-tone-brush", p = `${f}.smooth`, m = `${f}.panel`, h = `${f}.paint`, g = [
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
], _ = {
	smoothing: 50,
	smoothSize: 50,
	textureAmount: 100,
	textureSize: 50
}, v = (e) => `${p}.${e}`, y = "mask", b = "maskOn", x = {
	mask: v(y),
	maskOn: v(b),
	smoothing: v("smoothing"),
	smoothSize: v("smoothSize"),
	textureAmount: v("textureAmount"),
	textureSize: v("textureSize")
}, S = (e) => typeof e == "number" && Number.isFinite(e);
function ee(e) {
	let t = { ..._ };
	for (let n of g) {
		let r = e[x[n.key]];
		S(r) && (t[n.key] = Math.min(n.max, Math.max(n.min, r)));
	}
	return t;
}
function te(e) {
	return Object.fromEntries(g.map((t) => [x[t.key], e[t.key]]));
}
//#endregion
//#region src/persistence.ts
var C = (e) => typeof e == "number" && Number.isFinite(e);
function w(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return C(t.x) && C(t.y) && C(t.radius) && C(t.feather) && C(t.opacity) && C(t.flow) && typeof t.erase == "boolean";
}
function T(e) {
	let t = e[x.mask];
	return Array.isArray(t) && t.every(w) ? t : [];
}
var E = (e) => e.some((e) => !e.erase);
function D(e) {
	return {
		[x.mask]: [...e],
		[x.maskOn]: +!!E(e)
	};
}
function O() {
	return t.stores.useDevelopStore.getState();
}
function ne(e) {
	let t = O();
	t.setDynParams(D([...T(t.paramBag), ...e]));
}
function k() {
	return O().commitEdit("Skin Brush Stroke");
}
async function A() {
	let e = O();
	e.setDynParams(D([])), await e.commitEdit("Clear Skin Brush");
}
function j(e, t) {
	O().setDynParam(x[e], t);
}
function M(e) {
	let t = g.find((t) => t.key === e);
	return O().commitEdit(t?.history ?? "Skin Tone Brush");
}
async function N() {
	let e = O();
	e.setDynParams({
		...te(_),
		...D([])
	}), await e.commitEdit("Reset Skin Tone Brush");
}
//#endregion
//#region src/store.ts
var P = {
	brushSize: .08,
	brushFeather: .5,
	brushOpacity: 1,
	brushFlow: 1,
	brushErase: !1
}, F = null;
function I() {
	return F = t.stores.create()((e) => ({
		...P,
		armed: !1,
		showMask: !0,
		brushPreview: !1,
		setArmed: (t) => e({ armed: t }),
		toggleArmed: () => e((e) => ({ armed: !e.armed })),
		setShowMask: (t) => e({ showMask: t }),
		setBrush: (t) => e(t),
		setBrushPreview: (t) => e({ brushPreview: t })
	})), F;
}
function L() {
	if (!F) throw Error("[skin-tone-brush] store used before activate()");
	return F;
}
//#endregion
//#region src/wash.ts
var R = "230, 64, 64", re = .5;
function z(e, t) {
	let n = t.radiusToScreen(e.radius);
	if (n < .3) return null;
	let { x: r, y: i } = t.toScreen(e.x, e.y);
	return {
		x: r,
		y: i,
		r: n
	};
}
function B(e, t, n) {
	e.setTransform(1, 0, 0, 1, 0, 0);
	for (let r of t) {
		let t = z(r, n);
		if (!t) continue;
		let i = Math.max(0, Math.min(1, 1 - r.feather)), a = Math.max(0, Math.min(1, r.flow * (r.erase ? 1 : r.opacity))), o = e.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
		o.addColorStop(0, `rgba(${R}, ${a})`), o.addColorStop(i, `rgba(${R}, ${a})`), o.addColorStop(1, `rgba(${R}, 0)`), e.globalCompositeOperation = r.erase ? "destination-out" : "source-over", e.fillStyle = o, e.beginPath(), e.arc(t.x, t.y, t.r, 0, Math.PI * 2), e.fill();
	}
	e.globalCompositeOperation = "source-over";
}
function ie(e, t, n, r, i) {
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.clearRect(0, 0, r, i), B(e, t, n);
}
function ae(e, t) {
	if (t.length < e.length) return null;
	for (let n = 0; n < e.length; n++) if (t[n] !== e[n]) return null;
	return t.slice(e.length);
}
//#endregion
//#region src/Overlay.tsx
var V = {
	position: "absolute",
	display: "none",
	transform: "translate(-50%, -50%)",
	borderRadius: "50%",
	boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.35)",
	pointerEvents: "none"
};
function H(e) {
	let { brushSize: t, brushFeather: n, brushOpacity: r, brushFlow: i, brushErase: a } = e;
	return {
		brushSize: t,
		brushFeather: n,
		brushOpacity: r,
		brushFlow: i,
		brushErase: a
	};
}
function oe(e) {
	return e instanceof HTMLElement && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable);
}
function se() {
	let n = t.stores.useDevelopStore, r = L()((e) => e.armed), i = L()((e) => e.showMask), a = L()((e) => e.brushSize), o = L()((e) => e.brushFeather), c = L()((e) => e.brushErase), f = L()((e) => e.brushPreview), p = n((e) => e.photoId), m = n((e) => e.paramBag[x.mask]), { rect: h, nonce: g, toImage: _, toScreen: v, radiusToScreen: y, imageAspect: b } = t.develop.useDevelopOverlay(), [S, ee] = e.useState(!1), [te, C] = e.useState(!1), w = e.useRef(!1), E = e.useRef(null), D = e.useRef(null), O = e.useRef(null), A = e.useRef(null), j = e.useRef(null), M = e.useRef(null), N = e.useRef(null), P = e.useRef({
		lx: 0,
		ly: 0,
		shown: !1
	}), F = r && !!h && !!p && !!_ && !!v && !!y, I = (e) => {
		w.current = e, ee(e);
	};
	e.useEffect(() => {
		if (F && !S) return t.develop.setCanvasCursor("none", { priority: 20 });
	}, [F, S]), e.useEffect(() => {
		M.current = null, N.current = null;
	}, [p]), e.useEffect(() => {
		if (!F) {
			I(!1);
			return;
		}
		let e = (e) => {
			oe(e.target) || ((e.code === "Space" || e.ctrlKey || e.metaKey) && I(!0), e.altKey && C(!0));
		}, t = (e) => {
			(e.code === "Space" || !(e.ctrlKey || e.metaKey)) && I(!1), e.altKey || C(!1);
		}, n = () => {
			I(!1), C(!1);
		};
		return window.addEventListener("keydown", e, !0), window.addEventListener("keyup", t, !0), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e, !0), window.removeEventListener("keyup", t, !0), window.removeEventListener("blur", n), I(!1);
		};
	}, [F]);
	let R = (e, t, n) => {
		P.current = {
			lx: e,
			ly: t,
			shown: n
		};
		let r = L().getState(), i = y ? y(r.brushSize) : 0, a = (r, i) => {
			r && (r.style.display = n ? "block" : "none", r.style.width = `${i}px`, r.style.height = `${i}px`, r.style.left = `${e}px`, r.style.top = `${t}px`);
		};
		a(D.current, Math.max(3, i) * 2), a(O.current, Math.max(1, i * (1 - r.brushFeather)) * 2);
	};
	e.useEffect(() => {
		P.current.shown && R(P.current.lx, P.current.ly, !0);
	}, [a, o]), e.useEffect(() => {
		let e = A.current, t = E.current;
		if (!F || !i || !e || !t || !v || !y) return;
		let r = Math.max(1, Math.round(t.clientWidth)), a = Math.max(1, Math.round(t.clientHeight));
		(e.width !== r || e.height !== a) && (e.width = r, e.height = a, j.current = null);
		let o = e.getContext("2d");
		if (!o) return;
		let s = T(n.getState().paramBag), c = {
			toScreen: v,
			radiusToScreen: y
		}, l = j.current, u = l && l.canvas === e && l.nonce === g && l.toScreen === v && l.radiusToScreen === y ? ae(l.dabs, s) : null;
		u ? B(o, u, c) : ie(o, s, c, r, a), j.current = {
			canvas: e,
			dabs: s,
			nonce: g,
			toScreen: v,
			radiusToScreen: y
		};
	}, [
		F,
		i,
		g,
		m,
		v,
		y,
		n
	]), e.useEffect(() => {
		S && M.current && (M.current = null, k(), R(0, 0, !1));
	}, [S]);
	let z = (e) => {
		if (!F || w.current || e.button !== 0 || !_) return;
		let { lx: t, ly: n } = d(e.currentTarget, e.clientX, e.clientY), r = _(t, n);
		e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId);
		let i = H(L().getState());
		ne(e.shiftKey && N.current ? u(N.current, r, i, b, e.altKey) : [s(r, i, e.altKey, !0)]), N.current = r, M.current = { last: r }, R(t, n, !0);
	}, se = (e) => {
		if (!F || w.current || !_) return;
		let { lx: t, ly: n } = d(e.currentTarget, e.clientX, e.clientY);
		R(t, n, !0), C(e.altKey);
		let r = M.current;
		if (!r) return;
		let i = _(t, n), a = H(L().getState());
		l(r.last, i, a, b) && (ne([s(i, a, e.altKey, !1)]), r.last = i, N.current = i);
	}, U = (e) => {
		M.current && (M.current = null, e.currentTarget.hasPointerCapture(e.pointerId) && e.currentTarget.releasePointerCapture(e.pointerId), k());
	};
	if (!F) return null;
	let W = te || c, G = `1.5px ${W ? "dashed" : "solid"} ${W ? "rgba(255,107,107,0.95)" : "rgba(255,255,255,0.9)"}`, K = h && y ? y(a) : 0, q = (e, t) => ({
		...V,
		display: "block",
		border: t,
		left: `${h ? h.x + h.w / 2 : 0}px`,
		top: `${h ? h.y + h.h / 2 : 0}px`,
		width: `${e}px`,
		height: `${e}px`
	});
	return /* @__PURE__ */ e.createElement("div", {
		ref: E,
		"data-testid": "skin-tone-brush-overlay",
		onPointerDown: z,
		onPointerMove: se,
		onPointerUp: U,
		onPointerCancel: U,
		onPointerLeave: () => {
			M.current || R(0, 0, !1);
		},
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: S ? "none" : "auto",
			touchAction: "none",
			cursor: S ? "default" : "none",
			overflow: "hidden"
		}
	}, i ? /* @__PURE__ */ e.createElement("canvas", {
		ref: A,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			opacity: re
		}
	}) : null, /* @__PURE__ */ e.createElement("div", {
		ref: D,
		style: {
			...V,
			border: G
		}
	}), /* @__PURE__ */ e.createElement("div", {
		ref: O,
		style: {
			...V,
			border: "1px solid rgba(255,255,255,0.45)"
		}
	}), f && h ? /* @__PURE__ */ e.createElement("div", { style: {
		position: "absolute",
		inset: 0,
		pointerEvents: "none"
	} }, /* @__PURE__ */ e.createElement("div", { style: q(Math.max(3, K) * 2, "1.5px solid rgba(255,255,255,0.9)") }), /* @__PURE__ */ e.createElement("div", { style: q(Math.max(1, K * (1 - o)) * 2, "1px solid rgba(255,255,255,0.45)") })) : null);
}
function U(e, t) {
	let n = i(e, L().getState());
	return n ? (t && L().getState().setBrush(n), !0) : !1;
}
var W = {
	overlay: se,
	zoomable: !0,
	onEscape: () => L().getState().setArmed(!1),
	onAction: (e) => U(e, !0),
	wants: (e) => U(e, !1)
}, G = {
	fontSize: "10px",
	color: "var(--color-text-muted)",
	lineHeight: 1.4
}, K = [
	{
		key: "brushSize",
		label: "Size",
		min: 1,
		max: 50,
		defaultValue: 8
	},
	{
		key: "brushFeather",
		label: "Feather",
		min: 0,
		max: 100,
		defaultValue: 50
	},
	{
		key: "brushOpacity",
		label: "Opacity",
		min: 1,
		max: 100,
		defaultValue: 100
	},
	{
		key: "brushFlow",
		label: "Flow",
		min: 1,
		max: 100,
		defaultValue: 100
	}
];
function q() {
	let { Slider: n } = t.components, { Button: r, Toggle: i, Row: a, Stack: o } = t.ui, s = t.stores.useDevelopStore, c = s((e) => e.paramBag), l = L()((e) => e.armed), u = L()((e) => e.showMask), d = L()((e) => e), f = t.develop.useCanvasToolHeld();
	e.useEffect(() => {
		l && !f && L().getState().setArmed(!1);
	}, [l, f]);
	let p = ee(c), m = E(T(c)), _ = t.keybindings.getBinding(h), v = (t) => /* @__PURE__ */ e.createElement(n, {
		key: t.key,
		label: t.label,
		value: p[t.key],
		min: t.min,
		max: t.max,
		step: 1,
		defaultValue: t.default,
		onChange: (e) => j(t.key, e),
		onCommit: () => void M(t.key)
	}), y = (t) => /* @__PURE__ */ e.createElement(n, {
		key: t.key,
		label: t.label,
		value: Math.round(d[t.key] * 100),
		min: t.min,
		max: t.max,
		step: 1,
		defaultValue: t.defaultValue,
		onChange: (e) => {
			L().getState().setBrush({ [t.key]: e / 100 }), L().getState().setBrushPreview(!0);
		},
		onCommit: () => L().getState().setBrushPreview(!1)
	});
	return /* @__PURE__ */ e.createElement(o, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, /* @__PURE__ */ e.createElement("div", { style: {
		display: "flex",
		flexDirection: "column",
		gap: "1px"
	} }, g.map(v)), /* @__PURE__ */ e.createElement(a, {
		gap: 6,
		style: { marginTop: "4px" }
	}, /* @__PURE__ */ e.createElement(r, {
		size: "sm",
		active: l,
		title: _ ? `Paint over skin (${_})` : "Paint over skin",
		onClick: () => L().getState().toggleArmed()
	}, l ? "Done" : "Paint"), /* @__PURE__ */ e.createElement(r, {
		size: "sm",
		variant: "ghost",
		disabled: !m,
		onClick: () => void A()
	}, "Clear"), /* @__PURE__ */ e.createElement("span", { style: {
		...G,
		marginLeft: "auto"
	} }, m ? "Painted" : "Nothing painted")), !m && !l ? /* @__PURE__ */ e.createElement("span", { style: G }, "Paint over skin: the sliders act only where you paint.") : null, l ? /* @__PURE__ */ e.createElement(o, {
		gap: 2,
		style: {
			padding: "6px",
			borderRadius: "4px",
			background: "var(--color-surface-2)"
		}
	}, K.map(y), /* @__PURE__ */ e.createElement(a, {
		gap: 12,
		style: { marginTop: "4px" }
	}, /* @__PURE__ */ e.createElement(i, {
		checked: d.brushErase,
		onChange: (e) => L().getState().setBrush({ brushErase: e }),
		label: "Erase"
	}), /* @__PURE__ */ e.createElement(i, {
		checked: u,
		onChange: (e) => L().getState().setShowMask(e),
		label: "Show mask"
	})), /* @__PURE__ */ e.createElement("span", { style: G }, "Alt erase · [ ] size · ⇧[ ] feather · , . opacity · ⇧, ⇧. flow")) : null);
}
//#endregion
//#region src/model.ts
var ce = 4096, le = .5, ue = 1e-4, de = {
	min: 1,
	ratio: 20
}, fe = {
	min: 4,
	ratio: 16
}, pe = .02, me = .1, J = (e) => Number.isInteger(e) ? `${e}.0` : String(e), Y = (e) => Array.from({ length: 6 }, (e, t) => t + 1).map((t) => `stbTap(p, dir, ${e * t} * stride)`), he = Array.from({ length: 6 }, (e, t) => {
	let n = t + 1, [r, i] = [Y(1)[t], Y(-1)[t]];
	return `    w = exp(-${J(n * n)} / (2.0 * t2));\n    acc += w * (${r} + ${i});\n    wsum += 2.0 * w;`;
}).join("\n"), X = `
ivec2 stbSize() { return ivec2(floor(1.0 / uTexel + 0.5)); }
float stbAnchor() {
  vec2 res = 1.0 / uTexel;
  return max(res.x, res.y) / ${J(ce)};
}
float stbSplitRef(float v) { return ${J(de.min)} * pow(${J(de.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
float stbSmoothRef(float v) { return ${J(fe.min)} * pow(${J(fe.ratio)}, clamp(v, 0.0, 100.0) / 100.0); }
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
    if ((q - 1.0) / 3.0 + q * ${J(le)} > v2) break;
    p = q;
    n++;
  }
  t2 = clamp((v2 - (p - 1.0) / 3.0) / p, ${J(ue)}, ${J(3)});
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
${he}
  return acc / wsum;
}`, ge = "c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbWideVariance(textureSize, smoothSize));", _e = "return stbChainRegion(stbWideVariance(textureSize, smoothSize));", ve = "c.rgb = stbChainDraw(ivec2(gl_FragCoord.xy), c.rgb, stbSplitVariance(textureSize));", ye = "return stbChainRegion(stbSplitVariance(textureSize));", be = "\n{\n  ivec2 p = ivec2(gl_FragCoord.xy);\n  ivec2 nb = max(stbSize() / 2, ivec2(1));\n  ivec2 b = min(p / 2, nb - 1) * 2;\n  vec3 e = 0.25 * (stbAt(b) + stbAt(b + ivec2(1, 0)) + stbAt(b + ivec2(0, 1)) + stbAt(b + ivec2(1, 1)));\n  int ch = p.x % 2 + 2 * (p.y % 2);\n  c = vec4(fetchInput(p), ch == 0 ? e.r : (ch == 1 ? e.g : e.b));\n}", xe = `
float stbPacked(ivec2 blk, int ch) {
  return fetchPrev4(clamp(blk * 2 + ivec2(ch % 2, ch / 2), ivec2(0), stbSize() - 1)).a;
}
vec3 stbBlock(ivec2 blk) { return vec3(stbPacked(blk, 0), stbPacked(blk, 1), stbPacked(blk, 2)); }
vec3 stbEven(ivec2 p) {
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
  float ref = max((abs(low.r) + abs(low.g) + abs(low.b)) / 3.0, ${J(pe)});
  float q = dot(d, d) / (3.0 * ref * ref * ${J(me * me)});
  return exp(-q * q);
}`, Se = "\n{\n  ivec2 p = ivec2(gl_FragCoord.xy);\n  vec3 low = c.rgb;\n  vec3 d = stbEven(p) - low;\n  float s = clamp(smoothing, 0.0, 100.0) / 100.0;\n  float k = clamp(textureAmount, 0.0, 150.0) / 100.0;\n  c = vec4(s * stbProtection(d, low) * d + (k - 1.0) * (fetchInput(p) - low), 1.0);\n}", Ce = "\nif (maskOn > 0.5) {\n  float cov = mask(srcUv);\n  if (cov > 0.0) lin += cov * stageResult;\n}", Z = (e) => {
	let t = g.find((t) => t.key === e);
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
}, we = {
	key: b,
	glslType: "float",
	default: 0,
	label: "Painted"
};
function Te() {
	return {
		id: p,
		name: "Skin Tone Brush",
		phase: "decode",
		priority: 900,
		space: { encoding: "perceptual" },
		reads: "current",
		presetScope: "per-image",
		dormantWhen: { [b]: 0 },
		uniforms: [we],
		textures: [{
			key: y,
			kind: "coverage"
		}],
		passes: [
			{
				glsl: ge,
				helpers: X,
				region: _e,
				iterations: 20,
				channels: 4,
				uniforms: [Z("textureSize"), Z("smoothSize")]
			},
			{
				glsl: be,
				helpers: X,
				channels: 4
			},
			{
				glsl: ve,
				helpers: X,
				region: ye,
				iterations: 20,
				channels: 4,
				keep: !0,
				uniforms: [Z("textureSize")]
			},
			{
				glsl: Se,
				helpers: `${X}\n${xe}`,
				channels: 4,
				uniforms: [Z("smoothing"), Z("textureAmount")]
			}
		],
		glsl: Ce
	};
}
//#endregion
//#region src/index.tsx
var Q = null, $ = null;
function Ee(e) {
	n(e), I(), Q = e, e.registerProcessingStage(Te()), $ = L().subscribe((t, n) => {
		t.armed !== n.armed && e.develop.setCanvasTool(t.armed ? W : null);
	}), e.registerKeybinding({
		id: h,
		label: "Paint skin smoothing",
		category: "Develop",
		defaultCombo: "Shift+K",
		handler: () => {
			a() && e.stores.useDevelopStore.getState().photoId && L().getState().toggleArmed();
		}
	}), e.registerPanel({
		id: m,
		title: "Skin Tone Brush",
		component: q,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 250
		},
		onReset: () => void N()
	});
}
function De() {
	let e = Q;
	if (e) {
		Q = null;
		try {
			L().getState().setArmed(!1), $?.(), $ = null, e.develop.setCanvasTool(null), e.unregisterProcessingStage(p);
		} catch (e) {
			console.warn("[skin-tone-brush] deactivate failed:", e);
		}
	}
}
//#endregion
export { f as EXT_ID, m as PANEL_ID, Ee as activate, De as deactivate };

//# sourceMappingURL=index.js.map