import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { exportSvgImage } from '../../../utils/image-export.util';
import { ImageExportComponent } from '../image-export/image-export';

@Component({
  selector: 'app-chart-image-export',
  imports: [ImageExportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-export-actions"><app-image-export [createImage]="createImage" [title]="title()" [filename]="filename()" /></div>
    <ng-content />
  `,
  styles: `:host{display:block;min-width:0}.chart-export-actions{display:flex;justify-content:flex-end;padding-bottom:.25rem}`,
})
export class ChartImageExportComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly title = input('Графика · Президентски избори 2026');
  readonly filename = input('presidential-2026-chart.png');

  readonly createImage = (): Promise<Blob> => {
    const svg = this.element.nativeElement.querySelector<SVGSVGElement>('highcharts-chart svg.highcharts-root');
    if (!svg) return Promise.reject(new Error('Изчакайте графиката да се зареди преди експорт.'));
    return exportSvgImage(svg, getComputedStyle(document.body).backgroundColor, this.title());
  };
}
