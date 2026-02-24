import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ElectionList } from './election-list';

describe('ElectionList', () => {
  let component: ElectionList;
  let fixture: ComponentFixture<ElectionList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElectionList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
