import { Directive, Input, HostBinding } from '@angular/core';
import { hlm } from '../../../../../utils/hlm-utils';

@Directive({
  selector: 'table[hlmTable]',
  standalone: true,
})
export class HlmTableDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('w-full caption-bottom text-sm', this.class);
  }
}

@Directive({
  selector: 'thead[hlmTableHeader]',
  standalone: true,
})
export class HlmTableHeaderDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('[&_tr]:border-b', this.class);
  }
}

@Directive({
  selector: 'tbody[hlmTableBody]',
  standalone: true,
})
export class HlmTableBodyDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('[&_tr:last-child]:border-0', this.class);
  }
}

@Directive({
  selector: 'tr[hlmTableRow]',
  standalone: true,
})
export class HlmTableRowDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', this.class);
  }
}

@Directive({
  selector: 'th[hlmTableHead]',
  standalone: true,
})
export class HlmTableHeadDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', this.class);
  }
}

@Directive({
  selector: 'td[hlmTableCell]',
  standalone: true,
})
export class HlmTableCellDirective {
  @Input() class: string = '';
  @HostBinding('class')
  get columnClass() {
    return hlm('px-2 py-1 align-middle [&:has([role=checkbox])]:pr-0', this.class);
  }
}
