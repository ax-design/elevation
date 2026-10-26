// Browser checks for <ax-elevation> and the elevation layer on the surface engine.
import { setAlwaysUseFallback } from '@ax-design/surface';
import type { AxSurface } from '@ax-design/surface';
import { elevationShadows, register } from '../src/index.js';

interface Check {
    name: string;
    ok: boolean;
    detail: string;
}
declare global {
    interface Window {
        __result?: unknown;
        // The driver's step handshake: the page asks for a step, the driver acks it.
        __step?: string;
        __ack?: string;
    }
}

const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });
const frames = (n: number) =>
    new Promise<void>((resolve) => {
        const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
    });
const byId = (id: string) => document.getElementById(id) as AxSurface;
const canvasOf = (el: AxSurface) => el.shadowRoot!.querySelector('.layer-elevation canvas') as HTMLCanvasElement | null;
// Alpha of the shadow canvas at a point in the element's own coordinates.
const alpha = (el: AxSurface, x: number, y: number) => {
    const canvas = canvasOf(el)!;
    const s = el.debugState;
    const ratio = window.devicePixelRatio || 1;
    // The canvas is anchored dev device pixels beyond the layout box, symmetric, and the
    // shape's local coordinates are the host coordinates.
    const dev = (canvas.width - Math.round(s.width * ratio)) / 2;
    return canvas.getContext('2d')!.getImageData(Math.round(x * ratio + dev), Math.round(y * ratio + dev), 1, 1).data[3];
};
// The paint box the two shadows of a depth need: 1.5 blur around, moved by the offset.
const expectedPaint = (depth: number, w: number, h: number) => {
    let top = 0, side = 0, bottom = 0;
    for (const s of elevationShadows(depth)) {
        const reach = Math.ceil(s.blur * 1.5);
        top = Math.max(top, reach - s.y);
        side = Math.max(side, reach);
        bottom = Math.max(bottom, reach + s.y);
    }
    top = Math.ceil(top);
    side = Math.ceil(side);
    bottom = Math.ceil(bottom);
    return { left: -side, top: -top, width: w + 2 * side, height: h + top + bottom };
};
// The elevation layer remembers what it last painted and skips the redraw when nothing it depends
// on moved. A skipped redraw is invisible from the bitmap alone, so the shape checks watch the
// layer itself: every repaint begins by clearing its canvas, which counts the draws.
let repaints = 0;
const clearRect = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    if (this.canvas.parentElement?.classList.contains('layer-elevation')) repaints++;
    return clearRect.call(this, x, y, w, h);
};
// FNV-1a over the elevation canvas pixels: any change to the painted shadow changes it.
const bitmapHash = (el: AxSurface) => {
    const canvas = canvasOf(el)!;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
        h ^= data[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
};
// A CSS length in px; an unset one counts as 0, so a missing offset fails a check rather than throwing.
const px = (s: string) => parseFloat(s) || 0;
// The bitmap pixels under a box in the element's own coordinates. The canvas sits at its style
// offsets within the paint box, and its bitmap is scaled to its CSS size.
const bitmapRect = (el: AxSurface, box: { left: number; top: number; width: number; height: number }) => {
    const canvas = canvasOf(el)!;
    const sx = canvas.width / px(canvas.style.width);
    const sy = canvas.height / px(canvas.style.height);
    const ox = el.debugState.paint.left + px(canvas.style.left);
    const oy = el.debugState.paint.top + px(canvas.style.top);
    return {
        x: Math.round((box.left - ox) * sx),
        y: Math.round((box.top - oy) * sy),
        w: Math.round(box.width * sx),
        h: Math.round(box.height * sy),
    };
};
// FNV-1a over the pixels under a box, so a flat and a grown bitmap compare where they overlap.
const regionHash = (el: AxSurface, box: { left: number; top: number; width: number; height: number }) => {
    const canvas = canvasOf(el)!;
    const r = bitmapRect(el, box);
    const data = canvas.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
        h ^= data[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
};
// Bitmap pixels with any alpha left of an x in the element's coordinates.
const inkLeftOf = (el: AxSurface, x: number) => {
    const canvas = canvasOf(el)!;
    const sx = canvas.width / px(canvas.style.width);
    const ox = el.debugState.paint.left + px(canvas.style.left);
    const cols = Math.max(0, Math.min(canvas.width, Math.ceil((x - ox) * sx)));
    if (!cols) return 0;
    const data = canvas.getContext('2d')!.getImageData(0, 0, cols, canvas.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return n;
};
// The resolved shape's bounding box, as a comparable string.
const boundsOf = (el: AxSurface) => {
    const b = el.debugState.shape?.bounds;
    return b ? [b.left, b.top, b.right, b.bottom].join(',') : 'none';
};

async function run() {
    register();
    await frames(8);

    // 1. <ax-elevation>: the shadow is below the element, cut out under it, gone at the edge.
    const e = byId('e');
    check('ax-elevation draws on a canvas', !!canvasOf(e));
    const p = e.debugState.paint;
    const want = expectedPaint(16, 100, 60);
    check('the paint box fits both shadows', JSON.stringify(p) === JSON.stringify(want), `${JSON.stringify(p)} vs ${JSON.stringify(want)}`);
    const below = alpha(e, 50, 66);
    const above = alpha(e, 50, -4);
    // Elevation shadows are light: about 6% black right below at depth 16.
    check('the shadow falls below the element', below > 8 && below > 2 * above, `below=${below} above=${above}`);
    check('the shadow is cut out under the element', alpha(e, 50, 30) === 0, `alpha=${alpha(e, 50, 30)}`);
    check('the shadow fades out at the paint box edge', alpha(e, 50, p.top + p.height - 1) < 8, `alpha=${alpha(e, 50, p.top + p.height - 1)}`);
    check('the content stays visible', (document.getElementById('content') as HTMLElement).getBoundingClientRect().width > 0);

    // 2. --elevation-depth inherits, as in the original.
    const inherited = byId('inherit');
    check('depth inherits from a parent', inherited.debugState.values!.number('--elevation-depth') === 8 && alpha(inherited, 50, 64) > 0);

    // 3. Depth 0 draws nothing and grows nothing.
    const zero = byId('zero');
    const zp = zero.debugState.paint;
    check('depth 0 draws nothing', zp.left === 0 && zp.top === 0 && zp.width === 100 && zp.height === 60 && alpha(zero, 50, 61) === 0, JSON.stringify(zp));

    // 4. Any shape: a soft star casts a star shadow. Just outside the scoop of its bottom left
    // corner, inside the bounding box, a box shadow would be cut out; the star's shadow is there,
    // fading away from the edge.
    const star = byId('star');
    // The scoop is the circle of radius 60 around (0, 120); its edge on the diagonal is at
    // (42.4, 77.6).
    const near = alpha(star, 38.9, 81.1);
    const far = alpha(star, 14, 106);
    check('the shadow follows the shape', near > 8 && far < near / 2, `near=${near} far=${far}`);
    check('the shadow is cut out under the shape', alpha(star, 60, 60) === 0);

    // 5. A transition of the depth draws the steps in between.
    const grow = byId('grow');
    grow.classList.add('up');
    const seen = new Set<number>();
    const start = performance.now();
    let ticks = 0;
    // A slow headless engine can take seconds to tick the first frames; wait for the
    // transition to land (bounded) instead of sampling a fixed window of wall time.
    for (;;) {
        await frames(1);
        ticks++;
        seen.add(Math.round(grow.debugState.values!.number('--elevation-depth')));
        if (seen.has(24) || performance.now() - start > 5000) break;
    }
    // Intermediates: every sampled step that is neither the first nor the final value.
    const steps = [...seen];
    const between = steps.filter((d) => d !== steps[0] && d !== 24).length;
    // The engine can only follow the transition on the frames the browser produces: a
    // headless WebKit ticks a few times over the whole transition. Ask for at least three
    // intermediate steps, scaled down to what the frame budget allowed.
    check('a depth transition redraws in between', seen.has(24) && between >= Math.min(3, ticks - 2), `${steps.join(' ')} in ${ticks} frames`);

    // 6. Changing the shape repaints the shadow. The docs page's Shape example moves the radius
    //    and the corner shape of a card, and the shadow has to follow. Cutting a notch inside a
    //    24px radius leaves the bounding box exactly where it was, so a memo that remembers the
    //    shape by its bounds alone keeps the old silhouette on the canvas.
    e.style.setProperty('--ax-radius', '24px');
    await frames(3);
    const roundHash = bitmapHash(e);
    const roundBounds = boundsOf(e);
    const shapeRepaints = repaints;
    e.style.setProperty('--ax-corner-shape', 'notch');
    await frames(3);
    const notchHash = bitmapHash(e);
    check(
        'a shape change with unchanged bounds repaints the shadow',
        notchHash !== roundHash && boundsOf(e) === roundBounds && repaints > shapeRepaints,
        `bounds ${roundBounds} -> ${boundsOf(e)}, hash ${roundHash} -> ${notchHash}, repaints ${repaints - shapeRepaints}`
    );
    // And back to round: same bounds again, and the shadow has to come back.
    e.style.setProperty('--ax-corner-shape', 'round');
    await frames(3);
    check(
        'changing the corner shape back repaints the shadow again',
        bitmapHash(e) !== notchHash && repaints - shapeRepaints >= 2,
        `repaints ${repaints - shapeRepaints}`
    );

    // 7. A style change the shadow does not depend on must not redraw. A redundant redraw is not
    //    free (Firefox clears an acrylic layer's backdrop for a frame or two), which is exactly
    //    why the layer remembers what it painted.
    const idleRepaints = repaints;
    e.style.setProperty('--ax-tilt-mode', 'relative');
    await frames(3);
    check('an unrelated style change does not redraw the shadow', repaints === idleRepaints, `repaints ${repaints - idleRepaints}`);
    // 7b. --elevation-color tints the shadow, and its alpha scales it; black is the original.
    const tint = byId('tint');
    const rgb = (el: AxSurface, x: number, y: number) => {
        const canvas = canvasOf(el)!;
        const s = el.debugState;
        const ratio = window.devicePixelRatio || 1;
        const dev = (canvas.width - Math.round(s.width * ratio)) / 2;
        return Array.from(canvas.getContext('2d')!.getImageData(Math.round(x * ratio + dev), Math.round((s.height + 3) * ratio + dev), 1, 1).data);
    };
    const [tr, tg, tb, ta] = rgb(tint, 50, 0);
    const [br, bg, bb] = rgb(e, 50, 0);
    check('the default shadow colour is black', br === 0 && bg === 0 && bb === 0, `${br},${bg},${bb}`);
    check('--elevation-color tints the shadow', ta > 8 && tr > 200 && tg < 40 && tb > 200, `${tr},${tg},${tb},${ta}`);
    const full = alpha(tint, 50, 60 + 3);
    tint.style.setProperty('--elevation-color', 'rgba(255, 0, 255, 0.5)');
    await frames(3);
    const half = alpha(tint, 50, 60 + 3);
    check('the alpha of --elevation-color scales the shadow', half > 0 && Math.abs(half - full / 2) <= 6, `${full} -> ${half}`);
    const colorRepaints = repaints;
    tint.style.setProperty('--elevation-color', 'rgb(0, 255, 255)');
    await frames(3);
    check('a new colour repaints the shadow', repaints > colorRepaints, `repaints ${repaints - colorRepaints}`);
    tint.style.removeProperty('--elevation-color');
    e.style.removeProperty('--ax-tilt-mode');
    e.style.removeProperty('--ax-corner-shape');
    e.style.removeProperty('--ax-radius');

    // 8. Forced colors removes box-shadow, so the layer hides its canvas, and shows the same bitmap
    //    again when forced colors ends. The driver emulates the media; a driver without it skips this.
    const media = async (step: string) => {
        window.__step = step;
        while (window.__ack !== step) await frames(1);
        await frames(3);
    };
    await frames(3);
    const before = bitmapHash(e);
    await media('forced-on');
    if (matchMedia('(forced-colors: active)').matches) {
        check('forced colors hides the shadow canvas', getComputedStyle(canvasOf(e)!).display === 'none', getComputedStyle(canvasOf(e)!).display);
        await media('forced-off');
        check('the shadow comes back after forced colors', getComputedStyle(canvasOf(e)!).display !== 'none' && bitmapHash(e) === before && alpha(e, 50, 66) > 8, `hash ${before} -> ${bitmapHash(e)}`);
    }

    // 9. setAlwaysUseFallback(true) is the page asking for the fallback, as ThemeShadow does on
    //    Windows (battery saver, slow hardware): the canvas hides, and shows the same bitmap again
    //    when the page turns it off. Off again before any later check.
    const fallbackBefore = bitmapHash(e);
    setAlwaysUseFallback(true);
    await frames(3);
    check('setAlwaysUseFallback(true) hides the shadow canvas', getComputedStyle(canvasOf(e)!).display === 'none', getComputedStyle(canvasOf(e)!).display);
    setAlwaysUseFallback(false);
    await frames(3);
    check(
        'setAlwaysUseFallback(false) shows the shadow again with the same bitmap',
        getComputedStyle(canvasOf(e)!).display !== 'none' && bitmapHash(e) === fallbackBefore,
        `hash ${fallbackBefore} -> ${bitmapHash(e)}, display ${getComputedStyle(canvasOf(e)!).display}`
    );

    // 10. A motion fades the shadow with its opacity, on the canvas itself. A 3D motion keeps the
    //     shape flat in Firefox: the layer draws the projected shadow, and its canvas grows with the
    //     paint box. Elsewhere the container carries the 3D transform and the canvas draws as usual.
    const m = byId('m');
    await frames(3);
    const flat = { ...m.debugState.paint };
    check('the motion element starts flat at its own paint box', JSON.stringify(flat) === JSON.stringify(expectedPaint(16, 100, 60)), JSON.stringify(flat));
    // One box for every state: the projected shadow reaches past the flat paint box.
    const wide = { left: -200, top: -100, width: 400, height: 300 };
    const flatHash = regionHash(m, wide);
    const container = canvasOf(m)!.parentElement!;
    const motionFrames = async (state: Parameters<AxSurface['motion']>[0]) => {
        m.motion(state);
        await frames(3);
    };

    await motionFrames({ opacity: 0.4 });
    check('motion opacity fades the canvas', getComputedStyle(canvasOf(m)!).opacity === '0.4', getComputedStyle(canvasOf(m)!).opacity);
    check('motion opacity leaves the host opaque', getComputedStyle(m).opacity === '1', getComputedStyle(m).opacity);
    m.motion(null);
    await frames(3);
    check('motion(null) restores the canvas opacity', getComputedStyle(canvasOf(m)!).opacity === '1', getComputedStyle(canvasOf(m)!).opacity);
    check('motion(null) restores the flat bitmap', regionHash(m, wide) === flatHash && JSON.stringify(m.debugState.paint) === JSON.stringify(flat));

    if (/Firefox\//.test(navigator.userAgent)) {
        await motionFrames({ rotateY: 30, originX: -150, originY: 30 });
        const projected = { ...m.debugState.paint };
        check('firefox projects a 3D motion: the container stays flat', m.debugState.homography !== null && getComputedStyle(container).transform === 'none', getComputedStyle(container).transform);
        check('the projected paint box grows past the flat one', projected.left < flat.left && projected.width > flat.width, `${JSON.stringify(projected)} vs ${JSON.stringify(flat)}`);
        // Where the canvas really is on screen: the container is flat, so its rect is exact. The
        // canvas is anchored dev device pixels beyond the layout box, dev in 64-pixel steps, and
        // covers the paint box.
        const cv = canvasOf(m)!;
        const host = m.getBoundingClientRect();
        const rect = cv.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const side = Math.max(0, -projected.left, -projected.top, projected.left + projected.width - m.debugState.width, projected.top + projected.height - m.debugState.height);
        const anchor = -(Math.ceil((side * ratio) / 64) * 64) / ratio;
        const x = rect.left - host.left;
        const y = rect.top - host.top;
        check(
            'the canvas is anchored beside the layout box and covers the projected paint box',
            Math.abs(x - anchor) < 0.01 && Math.abs(y - anchor) < 0.01 && x <= projected.left && x + rect.width >= projected.left + projected.width && y <= projected.top && y + rect.height >= projected.top + projected.height,
            `canvas at ${x},${y} ${rect.width}x${rect.height}, anchor ${anchor}, box ${JSON.stringify(projected)}`
        );
        const ink = inkLeftOf(m, flat.left);
        check('the projected shadow falls left of the flat box', ink > 0, `ink pixels ${ink}`);
        const projectedHash = regionHash(m, wide);
        check('the projected bitmap differs from the flat one', projectedHash !== flatHash, `${projectedHash} vs ${flatHash}`);
        // A style change the shadow does not depend on, while projected, must not redraw it.
        const idle = repaints;
        m.style.setProperty('--ax-tilt-mode', 'relative');
        await frames(3);
        m.style.removeProperty('--ax-tilt-mode');
        await frames(3);
        check('an unrelated style change does not redraw a projected shadow', repaints === idle, `repaints ${repaints - idle}`);
        await motionFrames({ rotateY: 20, originX: -150, originY: 30 });
        const redrawn = regionHash(m, wide);
        check('a new projection redraws the shadow', redrawn !== projectedHash, `repaints ${repaints - idle}`);
        await motionFrames({ rotateY: 30, originX: -150, originY: 30 });
        check('the projected shadow comes back with the same bitmap', regionHash(m, wide) === projectedHash);
        // A projection change that keeps the paint box still repaints the shadow.
        const box = JSON.stringify(m.debugState.paint);
        await motionFrames({ rotateY: 30.1, originX: -150, originY: 30 });
        check(
            'a projection change inside the paint box redraws the shadow',
            JSON.stringify(m.debugState.paint) === box && regionHash(m, wide) !== projectedHash,
            `box ${box} -> ${JSON.stringify(m.debugState.paint)}`
        );
    } else {
        await motionFrames({ rotateY: 30, originX: -150, originY: 30 });
        check('chromium keeps the shape drawn flat under a 3D transform', m.debugState.homography !== null && m.debugState.paint.left === flat.left, JSON.stringify(m.debugState.paint));
        check('chromium carries the 3D motion on the container', getComputedStyle(container).transform !== 'none', getComputedStyle(container).transform);
        check('chromium draws the flat shadow under the motion', regionHash(m, wide) === flatHash);
    }
    m.motion(null);
    await frames(3);
    check('motion(null) restores the flat transform', getComputedStyle(container).transform === 'none');
    check('motion(null) restores the flat shadow', regionHash(m, wide) === flatHash && JSON.stringify(m.debugState.paint) === JSON.stringify(flat), JSON.stringify(m.debugState.paint));

    return { userAgent: navigator.userAgent, checks };
}

run().then(
    (r) => (window.__result = r),
    (e) => (window.__result = { error: String((e && e.stack) || e) })
);
