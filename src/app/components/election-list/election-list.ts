import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ElectionService } from '../../services/election';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardContentDirective,
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
} from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';

@Component({
  selector: 'app-election-list',
  imports: [
    CommonModule,
    RouterModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    HlmTypographyDirective,
  ],
  templateUrl: './election-list.html',
  styleUrl: './election-list.scss',
})
export class ElectionListComponent implements OnInit {
  dates: any = {};

  constructor(private electionService: ElectionService) { }

  ngOnInit(): void {
    this.dates = this.electionService.getDates();
  }
}
