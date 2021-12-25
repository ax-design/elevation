export class AxElevation extends HTMLElement {
  static readonly ElementName = 'ax-elevation';
  private root = this.attachShadow({ mode: 'open' });
  constructor() {
    super();
    this.root.innerHTML = `
    <div>
      <slot></slot>
    </div>
    <style>
      div { display: block; position: relative; width: 100%; height: 100%; box-shadow: 0 calc(0.400 * var(--elevation-depth, 0) * 1px) calc(0.900 * var(--elevation-depth, 0) * 1px) 0 rgba(0, 0, 0, calc(0.13441 - 0.00063 * var(--elevation-depth, 0) + 0.00003 * var(--elevation-depth, 0) * var(--elevation-depth, 0))), 0 calc(0.075 * var(--elevation-depth, 0) * 1px) calc(0.225 * var(--elevation-depth, 0) * 1px) 0 rgba(0, 0, 0, calc(0.10997 - 0.00051 * var(--elevation-depth, 0) + 0.00003 * var(--elevation-depth, 0) * var(--elevation-depth, 0))); }
      :host { display: inline-block; position: relative; }
      :host([block]) { display: block; }
      :host([inline-block]) { display: inline-block; }
      :host([flex]) { display: flex; }
      :host([inline-flex]) { display: inline-flex; }
      :host([grid]) { display: grid; }
      :host([inline-grid]) { display: inline-grid; }
      </style>`;
  }
}
