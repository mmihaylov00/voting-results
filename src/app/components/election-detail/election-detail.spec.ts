import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ElectionDetail } from './election-detail';

describe('ElectionDetail', () => {
  let component: ElectionDetail;
  let fixture: ComponentFixture<ElectionDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElectionDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
