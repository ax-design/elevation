import { AxElevation } from './CustomElements.js';
export function register() {
    customElements.define(AxElevation.ElementName, AxElevation);

    if (window.CSS && CSS.registerProperty) {
        CSS.registerProperty({
            name: '--elevation-depth',
            syntax: '<number>',
            initialValue: '0',
            inherits: true
        });
    } else {
        console.warn('Your browser do NOT support `CSS.registerProperty` method, register failed!');
    }
}