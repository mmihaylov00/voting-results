import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ElectionTypeSelectComponent } from './election-type-select';

describe('ElectionTypeSelectComponent', () => {
  it('links to both election archives and the party and candidate directory', async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionTypeSelectComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(ElectionTypeSelectComponent);
    await fixture.whenStable();
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.map(link => ({ name: link.getAttribute('aria-label'), path: link.getAttribute('href') }))).toEqual([
      { name: 'Президентски избори', path: '/presidential' },
      { name: 'Парламентарни избори', path: '/governmental' },
      { name: 'Партии и кандидати', path: '/governmental/contestants' },
    ]);
  });
});
