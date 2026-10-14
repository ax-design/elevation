<h1 align="center">
  <img src="https://raw.githubusercontent.com/ax-design/elevation/master/docs/logo.png" alt="elevation">
</h1>

<p align="center">
  Web component that implements the Elevation shadow of Axiom Design System.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ax-design/elevation"><img src="https://img.shields.io/npm/v/@ax-design/elevation.svg" alt="npm version"></a>
  <a href="https://github.com/ax-design/elevation/actions/workflows/ci.yml"><img src="https://github.com/ax-design/elevation/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT Licence" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ax-design/elevation/master/docs/screen-record.gif" alt="Screenshot">
</p>

## Installation

```bash
// with npm
npm install @ax-design/elevation

// with yarn
yarn add @ax-design/elevation
```

and import it:

```javascript
//CommonJS
require('@ax-design/elevation').register();

//ESModule
import { register } from '@ax-design/elevation';
register();
```

If you don't use a bundler, load `build/main.js` (it exposes `AxElevation`) or import `build/index.mjs`.

## Usage

Wrap the content that should float above the page in an `ax-elevation` component:

```html
<ax-elevation>
  elevation!
</ax-elevation>
```

## Style Controlling

### --elevation-depth

**Type:** `<number>`

**Default:** `0`

**Description:** How high the element floats. The shadow is two layers that grow with the depth: a large, soft one and a small, darker one under the element. `0` draws no shadow. Like the original, the property is inherited.

## With Surface

Elevation runs on [Surface](https://github.com/ax-design/surface). The shadow follows the shape of the element, so the shape properties of Surface apply to `ax-elevation` too:

```css
ax-elevation {
  --elevation-depth: 16;
  --ax-radius: 50%;
  --ax-corner-shape: scoop;
  --ax-corner-shoulder-radius: 8px;
}
```

You can also use it as a layer of `ax-surface`, together with the other layers:

```javascript
import { register } from '@ax-design/surface';
import { registerElevationLayer } from '@ax-design/elevation';

registerElevationLayer();
register();
```

```html
<ax-surface layers="elevation fill reveal">...</ax-surface>
```

Put `elevation` first, so the other layers paint on top of it. The shadow is cut out under the shape, so a translucent layer like `acrylic` does not darken.

## Changes in 0.1

* Elevation runs on Surface. The shadow follows any shape, not only rectangles.
* It works in browsers without `CSS.registerProperty`.
* The shadow is drawn with canvas shadows instead of `box-shadow`, with the same two layers and the same blur.
* 0.1.1: The shadow is redrawn only when its inputs change, not on every press and release. In Firefox, a redraw through a press turned acrylic above it clear for a frame or two.

## Development

```bash
bun install
bun run build         # es/, build/index.mjs, build/main.js
bun run check         # type check
bun run test:browser  # browser tests
```
