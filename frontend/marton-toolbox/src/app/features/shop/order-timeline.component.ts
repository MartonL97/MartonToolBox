import { Component, computed, input } from '@angular/core';
import { ShopOrder, orderTimeline } from '../../core/shop/cart.service';
import { I18N } from '../../core/i18n/translate.pipe';

/** The order's delivery steps, with the date each one happened. */
@Component({
  selector: 'mtb-order-timeline',
  standalone: true,
  imports: [...I18N],
  template: `
    <ol class="panel timeline">
      @for (step of steps(); track step.key) {
        <li [class.done]="step.done">
          @if (step.at) {
            <time>{{ step.at | ldate: 'd MMM y, HH:mm' }}</time>
          }
          <span>{{ 'order.step.' + step.key | t }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      margin: 16px 0;
    }
    .timeline {
      list-style: none;
      margin: 0;
    }
    li {
      position: relative;
      padding: 0 0 18px 26px;
      color: var(--text-3);
      font-size: 14px;
    }
    li:last-child {
      padding-bottom: 0;
    }
    li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--surface-2);
      border: 2px solid var(--text-3);
      box-sizing: border-box;
    }
    li:not(:last-child)::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 18px;
      bottom: -2px;
      width: 2px;
      background: var(--text-3);
      opacity: 0.35;
    }
    li.done {
      color: var(--text);
      font-weight: 600;
    }
    li.done::before {
      background: #15803d;
      border-color: #15803d;
    }
    li.done:has(+ li.done)::after {
      background: #15803d;
      opacity: 1;
    }
    time {
      display: block;
      color: var(--text-3);
      font-size: 12.5px;
      font-weight: 400;
    }
  `,
})
export class OrderTimelineComponent {
  order = input.required<ShopOrder>();
  steps = computed(() => orderTimeline(this.order()));
}
