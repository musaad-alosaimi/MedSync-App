import { Component, input } from '@angular/core';
import { MedForm } from '../core/models';

/** Hand-drawn line icons for each medicine form. `active` tints the accent blue. */
@Component({
  selector: 'app-med-icon',
  template: `
    <svg viewBox="0 0 64 64" [style.width.px]="size()" [style.height.px]="size()" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [class.active]="active()">
      @switch (form()) {
        @case ('capsule') {
          <g transform="rotate(-35 32 32)">
            <rect x="6" y="19" width="52" height="26" rx="13" fill="#fff" />
            <path d="M32 19h13a13 13 0 0 1 0 26H32z" class="accent" stroke="none" />
            <rect x="6" y="19" width="52" height="26" rx="13" />
            <path d="M32 19v26" />
          </g>
        }
        @case ('pill') {
          <rect x="13" y="7" width="38" height="50" rx="7" fill="#fff" />
          @for (p of pillDots; track p[0] + '-' + p[1]) {
            <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="5" />
            <path [attr.d]="'M' + (p[0] - 3) + ' ' + (p[1] - 3) + 'L' + (p[0] + 3) + ' ' + (p[1] + 3)" />
          }
        }
        @case ('injection') {
          <g transform="rotate(45 32 32)">
            <rect x="25" y="20" width="14" height="26" rx="2" fill="#fff" />
            <path d="M32 46v11M20 20h24M32 20V8M26 8h12M25 30h6M25 36h6" />
          </g>
        }
        @case ('spray') {
          <rect x="21" y="26" width="22" height="32" rx="4" fill="#fff" />
          <path d="M26 26v-7h12v7M30 19v-7h9M32 36v10M27 41h10" />
        }
        @case ('drop') {
          <rect x="20" y="30" width="24" height="27" rx="5" fill="#fff" />
          <path d="M26 30v-9h12v9M29 21v-9h6v9" />
          <path d="M32 38c-4 5-5 7-5 9.5a5 5 0 0 0 10 0c0-2.500-1-4.500-5-9.500z" class="accent-fill" />
        }
        @case ('syrup') {
          <rect x="10" y="27" width="26" height="30" rx="4" fill="#fff" />
          <path d="M16 27v-6h14v6M18 21v-5h10v5" />
          <path d="M23 36c-3 4-4 5.500-4 7.500a4 4 0 0 0 8 0c0-2-1-3.500-4-7.500z" class="accent-fill" />
          <ellipse cx="47" cy="40" rx="8" ry="5" fill="#fff" />
          <path d="M47 45v11" />
          <path d="M47 18c-2.500 3-3 4.500-3 6a3 3 0 0 0 6 0c0-1.500-.5-3-3-6z" class="accent-fill" />
        }
        @default {
          <circle cx="16" cy="32" r="3" fill="currentColor" />
          <circle cx="32" cy="32" r="3" fill="currentColor" />
          <circle cx="48" cy="32" r="3" fill="currentColor" />
        }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; color: #1f2937; }
    svg.active { color: var(--ms-primary); }
    .accent { fill: var(--ms-primary); }
    .accent-fill { fill: var(--ms-primary); stroke: var(--ms-primary); }
  `,
})
export class MedIconComponent {
  form = input.required<MedForm>();
  size = input(48);
  active = input(false);
  protected pillDots = [
    [25, 19],
    [39, 19],
    [25, 32],
    [39, 32],
    [25, 45],
    [39, 45],
  ];
}
