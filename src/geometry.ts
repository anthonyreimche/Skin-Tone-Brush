// Skin Tone Brush — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The pointer's place in the overlay's own layout pixels.

/** The pointer in `el`'s layout px. Under the Interface scale (a CSS zoom on
 *  the page) client coordinates and the element's box are zoomed px; the
 *  box's width over its layout width undoes the zoom, and is 1 without one. */
export function localPoint(el: HTMLElement, clientX: number, clientY: number): { lx: number; ly: number } {
  const r = el.getBoundingClientRect();
  const zoom = el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1;
  return { lx: (clientX - r.left) / zoom, ly: (clientY - r.top) / zoom };
}
