export const line = (skuId, name, overrides = {}) => ({
  skuId, name, sizeMl: 750, memberSkuIds: [skuId], status: 'graded',
  startOz: 25.4, purchasedOz: 0, endOz: 10.2, usedOz: 15.2, soldOz: 6,
  lossOz: 9.2, costPerOz: 5.84, missingCost: 53.71, gradePct: 39.5,
  flags: [], cleanForRollup: true, batchOpeningOz: 0, batchClosingOz: 0,
  openingLocations: [{skuId, skuName: name, zoneName: 'Main bar', bottles: 1, source: 'voice'}],
  closingLocations: [{skuId, skuName: name, zoneName: 'Main bar', bottles: .4, source: 'voice'}],
  receipts: [], sales: [{productId: 'azul-2oz', name: 'Clase Azul REP (2 oz)', quantity: 3, attributedOz: 6,
    options: [], recipe: [{name, oz: 2}]}], ...overrides,
});
const daily = (date, servedOz, openedBottles, expectedDiscardOz, status = 'modeled', reason = null) => ({date, servedOz, openedBottles, expectedDiscardOz, status, reason});
export const model = {
  start: '2026-10-16', end: '2026-10-30', status: 'partial', servedOz: 25, openedBottles: 8, wholeBottles: 0,
  expectedDiscardOz: null, poolCost: 28.8, effectiveCostPerOz: 1.152, coveredDays: 13, skippedDays: 1,
  days: [daily('2026-10-17', 3, 1, 3.323), daily('2026-10-30', 1, null, null, 'boundary', 'Count splits the operating day; discard is not estimated.')],
};
export const snapshot = {
  version: 1, openingCountId: 'opening', endingCountId: 'ending',
  gradePct: 92.4, letter: 'B', netMissingCost: 124.5, windowStart: '2026-10-16T18:00:00Z', windowEnd: '2026-10-30T18:00:00Z',
  windowDays: 14, capturedAt: '2026-10-30T18:55:00Z', counterName: 'Test counter', driftDays: 28, trailingUnsoldBottles: null,
  lines: [line('low', 'Lower dollar item', {missingCost: 1}), line('azul', 'Clase Azul Reposado'),
    line('surplus', 'Excess attribution item', {missingCost: -20, lossOz: -10, status: 'found'}),
    line('drift', 'Count drift item', {missingCost: 5, status: 'drift'}),
    line('excluded', 'Incomplete item', {missingCost: null, costPerOz: null, status: 'excluded', flags: ['no_cost']}),
  ],
  graded: {gradePct: 92.4, letter: 'B', netMissingCost: 124.5, gradedLines: 2, excludedLines: 1,
    classes: [{className: 'Tequila', usedDollars: 500, soldDollars: 375.5, netDollars: -124.5, ratingPct: 75.1}],
    swaps: [{className: 'Tequila', overName: 'Premium reposado', underName: 'House reposado', matchedOz: 6, dollarDelta: 24, kind: 'substitution'}],
    wholeBottleGaps: [], found: [], drift: [],
  }, caveats: ['Some count uncertainty remains.'],
  risata: {skuId: 'risata', name: 'Risata Moscato 187 ml', observedUsedOz: 50.6, servedOz: 25, expectedDiscardOz: null,
    residualOz: null, residualCost: null, message: 'Daily bottle model using recorded sales.', period: model,
    month: {...model, status: 'complete', start: '2026-10-01T12:00:00Z', end: '2026-10-30T12:00:00Z', servedOz: 54, openedBottles: 19, poolCost: 68.4,
      expectedDiscardOz: 66.1, effectiveCostPerOz: 68.4 / 54, coveredDays: 29, skippedDays: 0,
      days: [7, ...Array(15).fill(3), 1, 1, ...Array(11).fill(0)].map((served, i) => {
        const opened = Math.ceil(served / 6);
        return daily(`2026-10-${String(i + 1).padStart(2, '0')}`, served, opened, opened * (187 / 29.5735) - served, 'covered');
      })}},
};
export const frozen = {status: 'frozen', published: snapshot, snapshot, message: null, corrections: [
  {sessionId: 'ending', at: '2026-10-30T20:00:00Z', by: 'Test admin', reason: 'Measured in a pitcher', afterPublication: true,
    changes: [{skuName: 'Clase Azul Reposado', zoneName: 'Main bar', before: .4, after: .65}]},
]};
export const legacy = {status: 'legacy', published: snapshot, snapshot: null, corrections: frozen.corrections, message: 'Historical headline retained.'};
export const unavailable = {status: 'unavailable', published: null, snapshot: null, corrections: [], message: 'No published grade retained.'};
// Grades frozen from 2026-11-06 add the cause sort and parked count-ups.
const lead = (kind, name, overrides = {}) => ({kind, name, partnerName: null, gapOz: 12.7, gapBottles: .5, dollars: 24.1,
  rungPct: null, recentGapOz: null, detail: null, ...overrides});
export const causes = {
  version: 1, windowStart: '2026-09-11T18:00:00Z', windowEnd: '2026-10-30T18:00:00Z', windowDays: 49, recentDays: 28, checked: 112,
  leads: [
    lead('substitution', 'Crown Royal Regal Apple', {partnerName: 'Crown Royal', gapOz: 16.6, gapBottles: .66, dollars: 18.2, recentGapOz: 3.4}),
    lead('overpour', 'Tito\'s Handmade', {rungPct: 86, gapOz: 41.3, gapBottles: 1.63, dollars: 31.4, recentGapOz: -.02}),
    lead('unrung', 'Hennessy VS', {detail: 'nothing_rung', gapOz: 12.7, gapBottles: .5, dollars: 24.1}),
    lead('unrung', 'Jameson', {rungPct: 61, gapOz: 20.2, gapBottles: .8, dollars: 16.9, recentGapOz: 9.8}),
    lead('setup', 'Falernum', {detail: 'cocktail_under', rungPct: 40, gapOz: 15, gapBottles: .59, dollars: 9.4, recentGapOz: 6}),
    lead('setup', 'Luxardo Maraschino', {detail: 'rung_over', rungPct: 140, gapOz: -9.1, gapBottles: -.36, dollars: -11.2, recentGapOz: -4}),
  ],
  evenedOut: [{name: 'Belvedere', gradeGapBottles: .3, longGapBottles: .02, gradeDollars: 9.8},
    {name: 'Grey Goose', gradeGapBottles: .25, longGapBottles: -.04, gradeDollars: 7.1}],
};
export const countUps = [{name: 'Bulleit Rye', upOz: 3.4, bottles: .13, dollars: 2.9}, {name: 'Aperol', upOz: 2.5, bottles: .1, dollars: 1.2}];
export const withCauses = structuredClone(frozen);
withCauses.snapshot.causes = causes;
withCauses.snapshot.graded.countUps = countUps;
export const quietCauses = structuredClone(frozen);
quietCauses.snapshot.causes = {...causes, recentDays: null, leads: [], evenedOut: []};
quietCauses.snapshot.graded.countUps = [];
export const incompleteAttribution = structuredClone(frozen);
incompleteAttribution.snapshot.risata.period.days.push(daily('2026-10-29', null, null, null, 'unavailable', 'Attribution is unknown.'));
incompleteAttribution.snapshot.risata.period.skippedDays++;
incompleteAttribution.snapshot.risata.month.status = 'partial';
incompleteAttribution.snapshot.risata.month.skippedDays = 1;
