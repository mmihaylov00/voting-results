import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardContentDirective,
  HlmCardDescriptionDirective,
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
} from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { MapIconComponent } from '../ui/map-icon/map-icon';

@Component({
  selector: 'app-election-type-select',
  imports: [
    RouterModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
    MapIconComponent,
  ],
  templateUrl: './election-type-select.html',
  styleUrl: './election-type-select.scss',
})
export class ElectionTypeSelectComponent {
  protected readonly navigationOptions = [
    {
      title: 'Президентски избори',
      description: 'Резултати от президентски избори и балотажи.',
      route: '/presidential',
      icon: 'person',
    },
    {
      title: 'Парламентарни избори',
      description: 'Резултати от парламентарни избори и сравнения във времето.',
      route: '/governmental',
      icon: 'parliament',
    },
    {
      title: 'Партии и кандидати',
      description: 'Профили на партии и президентски кандидати с история на участията им.',
      route: '/governmental/contestants',
      icon: 'users',
    },
  ] as const;
}
