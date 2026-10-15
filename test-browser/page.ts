// Browser checks for <ax-elevation> and the elevation layer on the surface engine.
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
    // A slow headless engine can take seconds to tick the first frames; wait for the
    // transition to land (bounded) instead of sampling a fixed window of wall time.
    for (;;) {
        await frames(1);
        seen.add(Math.round(grow.debugState.values!.number('--elevation-depth')));
        if (seen.has(24) || performance.now() - start > 5000) break;
    }
    const between = [...seen].filter((d) => d > 3 && d < 23).length;
    check('a depth transition redraws in between', between >= 3 && seen.has(24), [...seen].join(' '));

    return { userAgent: navigator.userAgent, checks };
}

run().then(
    (r) => (window.__result = r),
    (e) => (window.__result = { error: String((e && e.stack) || e) })
);
