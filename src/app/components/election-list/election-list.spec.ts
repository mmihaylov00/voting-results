import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHighcharts } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { of } from 'rxjs';

import { ElectionListComponent } from './election-list';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';

describe('ElectionListComponent', () => {
  let component: ElectionListComponent;
  let fixture: ComponentFixture<ElectionListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionListComponent],
      providers: [
        provideHighcharts({
          instance: () => Promise.resolve(Highcharts as any),
        }),
        {
          provide: ElectionService,
          useValue: {
            loading$: of(false),
            getDates: () => [],
            getAllData: () => of({}),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            darkMode: () => false,
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElectionListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
