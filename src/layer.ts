// The elevation shadow as a surface layer. The look is the formula of the original
// <ax-elevation>: two black shadows that grow with --elevation-depth. The original drew them with
// box-shadow, which only follows rounded rectangles; this layer draws them with canvas shadows so
// they follow any surface shape. Like box-shadow, the shadow is cut out under the shape, so a
// translucent layer on top does not darken. Drawn only when the style, the size or the projection
// of a motion changes. A motion fades the shadow with its opacity, on the canvas itself; in Firefox
// it is drawn through the projected outline, as the container is flat meanwhile.
// The shadow follows WinUI's ThemeShadow policy: no shadow in High Contrast, with transparency
// effects off, or when the page asks for the fallback. box-shadow did the same in forced colors.
import { projectContour, traceContour } from '@ax-design/shape';
import type { Contour, Homography, Point } from '@ax-design/shape';
import { useFallback } from '@ax-design/surface';
import type { SurfaceFrame, SurfaceLayer, Values } from '@ax-design/surface';
import type { PropertySpec } from '@ax-design/typed-om';

// Read through the surface engine. register() registers it with its original definition.
export const ELEVATION_SCHEMA: PropertySpec[] = [{ name: '--elevation-depth', syntax: { type: 'number' }, initial: '0', inherits: true }];

export interface ElevationShadow {
    // Offset down, in px.
    y: number;
    // Blur radius in px, as in box-shadow.
    blur: number;
    alpha: number;
}

// The two shadows of the original stylesheet, for a depth.
export function elevationShadows(depth: number): ElevationShadow[] {
    const d = Math.max(0, depth);
    return [
        { y: 0.4 * d, blur: 0.9 * d, alpha: 0.13441 - 0.00063 * d + 0.00003 * d * d },
        { y: 0.075 * d, blur: 0.225 * d, alpha: 0.10997 - 0.00051 * d + 0.00003 * d * d },
    ];
}

// Whether two contours would paint the same shadow. The surface resolves a fresh shape on every
// style change, so most frames land here with a different object holding the same path: the walk
// settles it, and it stops at the first segment that differs.
function sameContour(a: Contour, b: Contour | null): boolean {
    if (a === b) return true;
    if (!b) return false;
    const x = a.segments;
    const y = b.segments;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
        const p = x[i];
        const q = y[i];
        if (p.type === 'line') {
            if (q.type !== 'line' || p.x0 !== q.x0 || p.y0 !== q.y0 || p.x1 !== q.x1 || p.y1 !== q.y1 || p.side !== q.side) return false;
        } else if (q.type === 'arc') {
            if (p.cx !== q.cx || p.cy !== q.cy || p.r !== q.r || p.start !== q.start || p.end !== q.end || p.side !== q.side || p.sideEnd !== q.sideEnd || p.anticlockwise !== q.anticlockwise) return false;
        } else return false;
    }
    return true;
}

// Whether two projections are the same matrix, for the redraw cache: a motion changes it on every
// frame.
function sameTilt(a: Homography | null, b: Homography | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < 9; i++) if (a[i] !== b[i]) return false;
    return true;
}

// A closed polyline on the canvas path.
function tracePolyline(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
}

export function createElevationLayer(): SurfaceLayer {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    // What the bitmap on screen was painted from; a frame that matches it skips the redraw. The
    // shadow follows the contour itself, not its bounding box: a 24px round corner and a 24px
    // notch share a box and cast different shadows, so the contour has to be part of the state.
    // Kept as numbers and walked as fields rather than as a key string, because this runs on
    // every frame of a resize or a depth transition and a string would allocate one per frame.
    let paintedDepth = NaN;
    let paintedRatio = NaN;
    let paintedDev = NaN;
    let paintedBorderTop = NaN;
    let paintedBorderRight = NaN;
    let paintedBorderBottom = NaN;
    let paintedBorderLeft = NaN;
    let paintedOutline: Contour | null = null;
    // The projection the shadow was drawn through, null when it was drawn flat. The projection
    // changes on every frame of a motion, so a motion repaints; a frame that leaves it as it was
    // does not.
    let paintedTilt: Homography | null = null;
    return {
        schema: ELEVATION_SCHEMA,
        static: true,
        overflow(v: Values) {
            // A canvas shadow blur of b is a gaussian of sigma b / 2; it fades out within 3 sigma.
            const out = [0, 0, 0, 0];
            for (const s of elevationShadows(v.number('--elevation-depth'))) {
                const reach = Math.ceil(s.blur * 1.5);
                out[0] = Math.max(out[0], reach - s.y);
                out[1] = Math.max(out[1], reach);
                out[2] = Math.max(out[2], reach + s.y);
                out[3] = Math.max(out[3], reach);
            }
            return out.map((n) => Math.ceil(n)) as [number, number, number, number];
        },
        attach(container) {
            canvas = document.createElement('canvas');
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.cssText = 'position:absolute;pointer-events:none;';
            ctx = canvas.getContext('2d');
            container.appendChild(canvas);
        },
        detach() {
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            canvas = null;
            ctx = null;
        },
        write(frame: SurfaceFrame) {
            if (!canvas || !ctx) return false;
            // The shadow hides when the effects fall back, and comes back on the first frame that
            // says so. Hidden with display: none, the canvas keeps its bitmap and the state below,
            // so showing it again needs no redraw. A frame from an older engine has no appearance:
            // it draws the shadow.
            const hidden = !!frame.appearance && useFallback(frame.appearance);
            const display = hidden ? 'none' : '';
            if (canvas.style.display !== display) canvas.style.display = display;
            // The motion's opacity, on the canvas itself: an ancestor would become the backdrop root
            // of acrylic. Missing from an older engine, it is 1.
            const opacity = typeof frame.opacity === 'number' ? String(frame.opacity) : '1';
            if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity;
            const { changed } = frame;
            // A tilt or a motion can move a projected shadow; the other tilts are carried by the
            // containers. The redraw cache below tells whether the shadow really changed.
            if (!changed.style && !changed.size && !changed.tilt && !changed.motion) return false;
            const { paint, values } = frame;
            const depth = values.number('--elevation-depth');
            const ratio = window.devicePixelRatio || 1;
            // The shadow only depends on the depth, the shape, the size and the projection. Any other
            // style change — a press and its release fire one without touching them — leaves the
            // canvas as is: a redraw that draws the same thing is not free, in Firefox it
            // turns the backdrop of an acrylic layer above clear for a frame or two.
            // The canvas is anchored a whole number of device pixels beyond the layout box,
            // growing in 64-pixel steps: its device position, size and drawing offset stay
            // constant while the paint box follows the depth, so the compositor never
            // re-snaps it against the element, at any device pixel ratio.
            const side = Math.max(0, -paint.left, -paint.top, paint.left + paint.width - frame.width, paint.top + paint.height - frame.height);
            const dev = Math.ceil((side * ratio) / 64) * 64;
            const widths = frame.borderWidths;
            const outline = frame.shape.outline;
            // Drawn through the projection when the surface projects its motion (Firefox): the
            // container is flat then, and the paint box holds the projected shape.
            const tilt = frame.projected && frame.tilt ? frame.tilt : null;
            // The bitmap maps 1:1 onto the device pixels at any ratio. Its size and position follow
            // the paint box, which grows with a projected motion, whether or not the shadow has to be
            // drawn again.
            const width = Math.round(frame.width * ratio) + 2 * dev;
            const height = Math.round(frame.height * ratio) + 2 * dev;
            // Container at paint.left plus this offset plus the in-bitmap dev offset is
            // the host origin: the canvas sits at one constant host position while the
            // paint box moves.
            const left = `${-paint.left - dev / ratio}px`;
            if (canvas.style.left !== left) canvas.style.left = left;
            const top = `${-paint.top - dev / ratio}px`;
            if (canvas.style.top !== top) canvas.style.top = top;
            // Grow the bitmap only: a resize reallocates the backing store, and the shadow
            // spreads a pixel at a time during the animation. Growing clears the bitmap.
            const grown = canvas.width < width || canvas.height < height;
            if (grown) {
                canvas.width = width;
                canvas.height = height;
            }
            const cssWidth = canvas.width / ratio + 'px';
            if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
            const cssHeight = canvas.height / ratio + 'px';
            if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
            // The scalars first: they settle a press, a resize or a depth step without walking
            // the path, and only a frame that matches all of them has to compare the contour.
            if (
                !grown &&
                depth === paintedDepth &&
                ratio === paintedRatio &&
                dev === paintedDev &&
                widths[0] === paintedBorderTop &&
                widths[1] === paintedBorderRight &&
                widths[2] === paintedBorderBottom &&
                widths[3] === paintedBorderLeft &&
                sameTilt(tilt, paintedTilt) &&
                sameContour(outline, paintedOutline)
            ) {
                return false;
            }
            paintedDepth = depth;
            paintedRatio = ratio;
            paintedDev = dev;
            paintedBorderTop = widths[0];
            paintedBorderRight = widths[1];
            paintedBorderBottom = widths[2];
            paintedBorderLeft = widths[3];
            paintedOutline = outline;
            paintedTilt = tilt ? (tilt.slice() as Homography) : null;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!(depth > 0)) return false;
            // The offset is a whole number of bitmap pixels and constant between anchor
            // steps: every frame rasterizes the same way and differs from the last only
            // where the shadow really grew.
            ctx.setTransform(ratio, 0, 0, ratio, dev, dev);
            ctx.fillStyle = '#000';
            ctx.beginPath();
            if (tilt) tracePolyline(ctx, projectContour(outline, tilt, 0.1 / ratio));
            else traceContour(ctx, outline);
            // Shadow offsets and blur are in device pixels, unaffected by the transform.
            for (const s of elevationShadows(depth)) {
                ctx.shadowColor = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, s.alpha))})`;
                // Offsets land on whole bitmap pixels either way (engines round them);
                // rounding here keeps the steps even while the depth animates.
                ctx.shadowBlur = Math.round(s.blur * ratio);
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = Math.round(s.y * ratio);
                ctx.fill();
            }
            // Cut the shape (and the shadows under it) out, a bitmap pixel wide beyond the
            // outline: the snapped drawing origin moves against the element by up to half a
            // bitmap pixel, and without the overlap the contact line shows a hairline.
            ctx.shadowColor = 'rgba(0, 0, 0, 0)';
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fill();
            ctx.lineWidth = 2 / ratio;
            ctx.strokeStyle = '#000';
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            return false;
        },
    };
}