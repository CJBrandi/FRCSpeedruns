import { describe, expect, it, vi } from 'vitest';
import {
  advanceRun,
  createRun,
  formatElapsed,
  normalizeTeamInput,
  normalizeYearInput,
  pathFromProxyLocation,
  proxyUrl,
  runResult,
  teamFromPath,
  teamYearPath,
} from '../src/game.js';

describe('game helpers', () => {
  it('normalizes team inputs', () => {
    expect(normalizeTeamInput('254')).toBe(254);
    expect(normalizeTeamInput('frc1678')).toBe(1678);
    expect(normalizeTeamInput('abc')).toBeNull();
  });

  it('normalizes optional year inputs', () => {
    expect(normalizeYearInput('2025')).toBe(2025);
    expect(normalizeYearInput('')).toBeNull();
    expect(normalizeYearInput('99')).toBeNull();
    expect(normalizeYearInput('2025abc')).toBeNull();
  });

  it('creates only valid distinct team runs', () => {
    expect(() => createRun({ startTeam: 254, targetTeam: 254, year: 2025 })).toThrow('different');

    const run = createRun({ startTeam: 254, targetTeam: 1678, year: 2025 });
    expect(run.currentPath).toBe('/team/254/2025');
    expect(run.year).toBe(2025);
    expect(run.linksClicked).toBe(0);
  });

  it('advances run state and finishes when target team is reached', () => {
    const run = createRun({ startTeam: 254, targetTeam: 1678, year: 2025 });
    const middle = advanceRun(run, '/event/2024cmp');
    const finished = advanceRun(middle, '/team/1678/2025');

    expect(middle.linksClicked).toBe(1);
    expect(middle.completed).toBe(false);
    expect(finished.linksClicked).toBe(2);
    expect(finished.completed).toBe(true);
    expect(finished.currentTeam).toBe(1678);
  });

  it('does not count reloads of the current page as new links', () => {
    const run = createRun({ startTeam: 254, targetTeam: 1678, year: 2025 });
    expect(advanceRun(run, '/team/254/2025')).toBe(run);
  });

  it('formats elapsed times', () => {
    expect(formatElapsed(47267)).toBe('47.26s');
    expect(formatElapsed(68721)).toBe('1:08.72');
  });

  it('creates run results with elapsed time and link count', () => {
    vi.setSystemTime(new Date('2026-05-25T17:00:00.000Z'));
    const run = createRun({ startTeam: 254, targetTeam: 1678, year: 2025 });
    const finished = { ...run, linksClicked: 3, completedAt: run.startedAt + 4200 };

    expect(runResult(finished)).toMatchObject({
      startTeam: 254,
      targetTeam: 1678,
      linksClicked: 3,
      elapsedMs: 4200,
      year: 2025,
    });
    vi.useRealTimers();
  });

  it('parses proxy URLs and team paths', () => {
    expect(teamYearPath(254, 2025)).toBe('/team/254/2025');
    expect(proxyUrl('/team/254/2025', 2025)).toBe('/proxy?path=%2Fteam%2F254%2F2025&year=2025');
    expect(pathFromProxyLocation('http://localhost:5173/proxy?path=%2Fevent%2F2024cmp')).toBe('/event/2024cmp');
    expect(teamFromPath('/team/4414')).toBe(4414);
  });
});
