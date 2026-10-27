import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RecurringRisksComponent } from '../../recurring-risks/recurring-risks';
import { ElectionGeographyComponent } from '../../election-geography/election-geography';
import { PollingAgenciesComponent } from '../../polling-agencies/polling-agencies';
import { SeatSimulatorComponent } from '../../seat-simulator/seat-simulator';

@Component({
  selector: 'app-election-tools',
  standalone: true,
  imports: [RecurringRisksComponent, ElectionGeographyComponent, PollingAgenciesComponent, SeatSimulatorComponent],
  template: `
    <div [hidden]="panel() !== 'risks'">
      @defer (when panel() === 'risks') { <app-recurring-risks /> }
    </div>
    @if (national()) {
      <div [hidden]="panel() !== 'geography'">
        @defer (when panel() === 'geography') { <app-election-geography /> }
      </div>
      <div [hidden]="panel() !== 'polls'">
        @defer (when panel() === 'polls') { <app-polling-agencies /> }
      </div>
      <div [hidden]="panel() !== 'mandates'">
        @defer (when panel() === 'mandates') { <app-seat-simulator /> }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElectionToolsComponent {
  readonly panel = input.required<string>();
  readonly national = input(false);
}
