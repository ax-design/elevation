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

    return { userAgent: navigator.userAgent, checks };
}

run().then(
    (r) => (window.__result = r),
    (e) => (window.__result = { error: String((e && e.stack) || e) })
);
