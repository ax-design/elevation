<h1 align="center">
  <img src="https://raw.githubusercontent.com/ax-design/elevation/master/docs/logo.png" alt="elevation">
</h1>

<p align="center">
  Web component that implements Elevation shadow effect of Axiom Design System.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ax-design/elevation"><img src="https://img.shields.io/npm/v/@ax-design/elevation.svg" alt="npm version"></a>
  <a href="https://travis-ci.com/ax-design/elevation"><img src="https://travis-ci.com/ax-design/elevation.svg?branch=master" alt="CI Status"></a>
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

## Usage

To add a reveal effect on your web application, you need to wrap a `ax-elevation` component with the component you want to add elevation depth.
Here's an example:

```html
<ax-elevation>
  elevation!
</ax-elevation>
```

## Style Controlling

elevation component uses custom properties to manage the style of the elevation depth.


### --elevation-depth

**Type:** `<number>`

**Default:** `0`

**Description:** The depth of elevation shadow.