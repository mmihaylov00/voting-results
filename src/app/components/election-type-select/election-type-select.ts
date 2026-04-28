import { CommonModule } from '@angular/common';
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

type ElectionTypeOption = {
  id: 'presidential' | 'governmental' | 'european' | 'mayoral';
  title: string;
  description: string;
  route: string;
  available: boolean;
};

@Component({
  selector: 'app-election-type-select',
  imports: [
    CommonModule,
    RouterModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
  ],
  templateUrl: './election-type-select.html',
  styleUrl: './election-type-select.scss',
})
export class ElectionTypeSelectComponent {
  protected readonly electionTypes: ElectionTypeOption[] = [
    {
      id: 'presidential',
      title: 'Президентски избори',
      description: 'Отделен изглед за президентски кампании и балотажи.',
      route: '/presidential',
      available: false,
    },
    {
      id: 'governmental',
      title: 'Парламентарни избори',
      description: 'Наличните в момента резултати и исторически трендове.',
      route: '/governmental',
      available: true,
    },
    {
      id: 'european',
      title: 'Европейски избори',
      description: 'Подготовка за избори за Европейски парламент.',
      route: '/european',
      available: false,
    },
    {
      id: 'mayoral',
      title: 'Местни избори',
      description: 'Подготовка за кметски и общински резултати.',
      route: '/mayoral',
      available: false,
    },
  ];
}
