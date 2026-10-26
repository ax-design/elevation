// @ax-design/elevation: the elevation shadow of Axiom Design System, on the @ax-design/surface
// engine.
import { hasLayer, registerLayer, register as registerSurface } from '@ax-design/surface';
import { AxElevation } from './element.js';
import { createElevationLayer } from './layer.js';

export { AxElevation } from './element.js';
export { ELEVATION_SCHEMA, createElevationLayer, elevationShadows } from './layer.js';
export type { ElevationShadow } from './layer.js';

// The original definition. It is a permanent contract: older copies of this package may have
// registered it first, and the first registration wins.
const PROPERTIES = [
    { name: '--elevation-depth', syntax: '<number>', initialValue: '0', inherits: true },
    { name: '--elevation-color', syntax: '<color>', initialValue: 'rgb(0, 0, 0)', inherits: true },
];

let propertyRegistered = false;
function registerProperty(): void {
    if (propertyRegistered) return;
    propertyRegistered = true;
    const css = typeof CSS !== 'undefined' ? (CSS as unknown as { registerProperty?: (d: unknown) => void }) : null;
    if (!css || !css.registerProperty) return;
    for (const property of PROPERTIES) {
        try {
            css.registerProperty(property);
        } catch (error) {
            if (!error || (error as Error).name !== 'InvalidModificationError') throw error;
        }
    }
}

// Registers the `elevation` layer for <ax-surface layers="elevation">.
export function registerElevationLayer(): void {
    registerProperty();
    // Another copy of this package may have registered it already.
    if (!hasLayer('elevation')) registerLayer('elevation', createElevationLayer);
}

// Defines <ax-elevation>, the `elevation` layer and <ax-surface>. Safe to call more than once.
export function register(): void {
    registerElevationLayer();
    registerSurface();
    if (!customElements.get(AxElevation.ElementName)) customElements.define(AxElevation.ElementName, AxElevation);
}
