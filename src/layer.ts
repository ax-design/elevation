// The elevation shadow as a surface layer. The look is the formula of the original
// <ax-elevation>: two black shadows that grow with --elevation-depth. The original drew them with
// box-shadow, which only follows rounded rectangles; this layer draws them with canvas shadows so
// they follow any surface shape. Like box-shadow, the shadow is cut out under the shape, so a
// translucent layer on top does not darken. Drawn only when the style or the size changes.
import { traceContour } from '@ax-design/shape';
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

export function createElevationLayer(): SurfaceLayer {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    // The key of the inputs of the last drawn frame; identical inputs skip the redraw.
    let painted = '';
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
            if (!canvas || !ctx || (!frame.changed.style && !frame.changed.size)) return false;
            const { paint, values } = frame;
            const depth = values.number('--elevation-depth');
            const ratio = window.devicePixelRatio || 1;
            // The shadow only depends on the depth, the shape and the size. Any other style
            // change — a press and its release fire one without touching them — leaves the
            // canvas as is: a redraw that draws the same thing is not free, in Firefox it
            // turns the backdrop of an acrylic layer above clear for a frame or two.
            const b = frame.shape.bounds;
            // The canvas is anchored a whole number of device pixels beyond the layout box,
            // growing in 64-pixel steps: its device position, size and drawing offset stay
            // constant while the paint box follows the depth, so the compositor never
            // re-snaps it against the element, at any device pixel ratio.
            const side = Math.max(0, -paint.left, -paint.top, paint.left + paint.width - frame.width, paint.top + paint.height - frame.height);
            const dev = Math.ceil((side * ratio) / 64) * 64;
            const key = `${depth}|${b.left.toFixed(2)} ${b.top.toFixed(2)} ${b.right.toFixed(2)} ${b.bottom.toFixed(2)}|${frame.borderWidths.join(',')}|${dev}`;
            if (key === painted) return false;
            painted = key;
            // The bitmap maps 1:1 onto the device pixels at any ratio.
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
            // spreads a pixel at a time during the animation.
            if (canvas.width < width || canvas.height < height) {
                canvas.width = width;
                canvas.height = height;
            }
            const cssWidth = canvas.width / ratio + 'px';
            if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
            const cssHeight = canvas.height / ratio + 'px';
            if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!(depth > 0)) return false;
            // The offset is a whole number of bitmap pixels and constant between anchor
            // steps: every frame rasterizes the same way and differs from the last only
            // where the shadow really grew.
            ctx.setTransform(ratio, 0, 0, ratio, dev, dev);
            ctx.fillStyle = '#000';
            ctx.beginPath();
            traceContour(ctx, frame.shape.outline);
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