import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { ElectionDetailComponent } from './election-detail';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';

describe('ElectionDetailComponent', () => {
  let component: ElectionDetailComponent;
  let fixture: ComponentFixture<ElectionDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionDetailComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            queryParams: of({}),
            snapshot: { paramMap: { get: () => null } },
          },
        },
        {
          provide: ElectionService,
          useValue: {
            loading$: of(false),
            getDates: () => [],
            getDateName: () => '',
            getAllFullData: () => of({}),
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

    fixture = TestBed.createComponent(ElectionDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
