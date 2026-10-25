import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync('src/newtab/index.html', 'utf8');

function idsIn(block: string): string[] {
  return [...block.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
}

describe('modal element ids', () => {
  test('no duplicate ids anywhere in the newtab page', () => {
    const all = idsIn(html);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  test('plan modal and classic grouping modal use separate containers', () => {
    const start = html.indexOf('id="aiActionModal"');
    const end = html.indexOf('id="aiPreviewModal"');
    const plan = idsIn(html.slice(start, end));
    const classic = idsIn(html.slice(end, html.indexOf('Undo bar')));

    expect(plan).toContain('aiPlanContent');
    expect(plan).toContain('aiPlanSummary');
    expect(classic).toContain('aiPreviewContent');
    expect(classic).toContain('aiPreviewSummary');

    // the classic preview must own the ids that collections.ts renders into
    const overlap = plan.filter((id) => classic.includes(id));
    expect(overlap).toEqual([]);
  });
});
