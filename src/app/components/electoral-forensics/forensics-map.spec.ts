import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsMapComponent } from './forensics-map';

describe('joint map indicators', () => {
  it('shows turnout, voter and both candidate gains in the same section tooltip', () => {
    const component = TestBed.createComponent(ForensicsMapComponent).componentInstance;
    const row = sectionFixture({ registered1: 200, deltaVoted: 40, deltaTurnoutPp: 20,
      candidateChanges: [candidateFixture('4', 10, 30), candidateFixture('25', 20, 50)],
      addedReviewFlags: ['2026.10.25:added_exceed_signed'], candidateReviewFlags: ['joint_turnout_growth_yotova_gain_larger'] });
    expect(component.tooltip(row)).toContain('Δ гласували +40');
    expect(component.tooltip(row)).toContain('Δ Гюров +20');
    expect(component.tooltip(row)).toContain('Δ Йотова +30');
    expect(component.tooltip(row)).toContain('Преглед: дописани, съвместен ръст');
    component.metric = 'candidate4';
    expect(component.markerValue(row)).toBe(10);
    component.metric = 'candidate25';
    expect(component.markerValue(row)).toBe(15);
    expect(component.markerValue({ ...row, registered1: 0 })).toBeNull();
  });
});
