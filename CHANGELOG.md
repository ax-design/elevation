# Changelog

All notable changes to this package are documented in this file.

## 0.2.1

- Built on Surface 0.3.3, which maps a pointer through a scaled or zoomed ancestor.

## 0.2.0

- Built on Surface 0.3. The shadow fades with `motion()`, and in Firefox it follows the projected outline of a surface during a 3D motion.
- The shadow is dropped whenever the effects fall back, forced colors included, like ThemeShadow on Windows.

## 0.1.1

- The shadow is redrawn only when its inputs change, not on every press and release. In Firefox, a redraw through a press turned acrylic above it clear for a frame or two.

## 0.1.0

- Elevation runs on Surface. The shadow follows any shape, not only rectangles.
- It works in browsers without `CSS.registerProperty`.
- The shadow is drawn with canvas shadows instead of `box-shadow`, with the same two layers and the same blur.
