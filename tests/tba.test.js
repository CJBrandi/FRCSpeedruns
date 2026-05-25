import { describe, expect, it } from 'vitest';
import {
  createClassicRun,
  fetchTbaTeams,
  getTeamFromPath,
  normalizePathForYear,
  pathMatchesYear,
  pickRandomPlayedRun,
  pickRandomRun,
  pickRandomYear,
  resolveTbaPath,
  rewriteTbaHtml,
  SAMPLE_TEAMS,
} from '../server/tba.js';

describe('TBA helpers', () => {
  it('picks distinct valid teams for a random run', () => {
    const run = pickRandomRun(SAMPLE_TEAMS, () => 0);

    expect(run.start.team_number).toBe(16);
    expect(run.target.team_number).toBe(67);
    expect(run.start.team_number).not.toBe(run.target.team_number);
    expect(run.year).toBe(new Date().getFullYear());
  });

  it('picks a random year inside the FRC era', () => {
    expect(pickRandomYear(() => 0, new Date('2026-05-25T00:00:00Z'))).toBe(2002);
    expect(pickRandomYear(() => 0.999, new Date('2026-05-25T00:00:00Z'))).toBe(2026);
  });

  it('reports missing TBA auth as a visible API error', async () => {
    await expect(fetchTbaTeams({ authKey: '' })).rejects.toThrow('Missing TBA_AUTH_KEY');
  });

  it('fetches every TBA team page for the selected year', async () => {
    const requests = [];
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      key: `frc${index + 1}`,
      team_number: index + 1,
    }));
    const secondPage = [
      { key: 'frc9000', team_number: 9000 },
      { key: 'frc11000', team_number: 11000 },
    ];
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      requests.push(path);
      const page = Number(path.split('/').at(-2));
      return { ok: true, json: async () => (page === 0 ? firstPage : page === 22 ? secondPage : []) };
    };

    const teams = await fetchTbaTeams({ authKey: 'key', fetchImpl, year: 2026 });

    expect(requests).toContain('/api/v3/teams/2026/0/simple');
    expect(requests).toContain('/api/v3/teams/2026/22/simple');
    expect(requests).toContain('/api/v3/teams/2026/30/simple');
    expect(teams).toHaveLength(502);
    expect(teams.map((team) => team.team_number)).toContain(11000);
  });

  it('filters sample teams to teams old enough for the selected year', async () => {
    const teams = await fetchTbaTeams({ sampleFallback: true, year: 1999 });

    expect(teams.map((team) => team.team_number)).toContain(254);
    expect(teams.map((team) => team.team_number)).not.toContain(6328);
  });

  it('normalizes only TBA paths and URLs', () => {
    expect(resolveTbaPath('/team/254')).toBe('/team/254');
    expect(resolveTbaPath('https://www.thebluealliance.com/event/2024cmp')).toBe('/event/2024cmp');
    expect(resolveTbaPath('https://example.com/team/254')).toBeNull();
  });

  it('extracts team numbers from team paths', () => {
    expect(getTeamFromPath('/team/1678')).toBe(1678);
    expect(getTeamFromPath('/event/2024cmp')).toBeNull();
  });

  it('rewrites internal links through the local proxy and blocks external links', () => {
    const html = rewriteTbaHtml(`
      <html>
        <head><link href="/py3_css/app.css" integrity="abc"></head>
        <body>
          <a href="/team/254" target="_blank">254</a>
          <a href="https://www.thebluealliance.com/event/2024cmp">CMP</a>
          <a href="https://example.com">External</a>
          <img src="/images/logo.png">
        </body>
      </html>
    `);

    expect(html).toContain('href="/proxy?path=%2Fteam%2F254"');
    expect(html).toContain('href="/proxy?path=%2Fevent%2F2024cmp"');
    expect(html).toContain('data-frc-speedrun-blocked="https://example.com/"');
    expect(html).toContain('href="https://www.thebluealliance.com/py3_css/app.css"');
    expect(html).toContain('src="https://www.thebluealliance.com/images/logo.png"');
    expect(html).not.toContain('integrity="abc"');
  });

  it('blocks the teams tab and non-matching years for year-scoped runs', () => {
    expect(normalizePathForYear('/team/254', 2025)).toBe('/team/254/2025');
    expect(normalizePathForYear('/team/254/2024', 2025)).toBe('/team/254/2025');
    expect(normalizePathForYear('/event/2025cacc', 2025)).toBe('/event/2025cacc');
    expect(normalizePathForYear('/event/2024cacc', 2025)).toBeNull();
    expect(normalizePathForYear('/teams', 2025)).toBeNull();
    expect(pathMatchesYear('/events/ca/2025', 2025)).toBe(true);
  });

  it('rewrites team links to the selected year and blocks the teams tab without an alert hook', () => {
    const html = rewriteTbaHtml(`
      <body>
        <form action="/search"><input name="q"></form>
        <select name="year"><option>2025</option></select>
        <a href="/teams">Teams</a>
        <a href="/team/254">254</a>
        <a href="/event/2024cmp">Wrong Year</a>
      </body>
    `, { year: 2025 });

    expect(html).toContain('data-frc-speedrun-blocked-route="Teams tab is blocked during a run."');
    expect(html).toContain('href="/proxy?path=%2Fteam%2F254%2F2025&year=2025"');
    expect(html).toContain('data-frc-speedrun-blocked-route="Only 2025 pages count for this run."');
    expect(html).not.toContain("window.alert('Teams tab is blocked during a run.");
    expect(html).toContain("window.alert('Find is blocked during FRC WikiRun.");
    expect(html).toContain("document.addEventListener('submit'");
    expect(html).toContain('control.disabled = true;');
    expect(html).toContain('Search and year controls are blocked during a run.');
  });

  it('requires manual classic teams to have both played an event in the selected year', async () => {
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      const bodies = {
        '/api/v3/team/frc254/years_participated': [2025],
        '/api/v3/team/frc1678/years_participated': [2025],
        '/api/v3/team/frc254/events/2025/simple': [{ key: '2025cacc' }],
        '/api/v3/team/frc1678/events/2025/simple': [{ key: '2025cada' }],
        '/api/v3/team/frc254': { key: 'frc254', team_number: 254, nickname: 'The Cheesy Poofs' },
        '/api/v3/team/frc1678': { key: 'frc1678', team_number: 1678, nickname: 'Citrus Circuits' },
        '/api/v3/team/frc254/districts': [],
        '/api/v3/team/frc1678/districts': [],
      };
      return { ok: true, json: async () => bodies[path] };
    };

    const run = await createClassicRun(254, 1678, { authKey: 'key', fetchImpl, year: 2025 });

    expect(run.year).toBe(2025);
    expect(run.start.team_number).toBe(254);
    expect(run.target.team_number).toBe(1678);
  });

  it('rejects manual classic teams that did not both play an event in the selected year', async () => {
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      const bodies = {
        '/api/v3/team/frc254/years_participated': [2025],
        '/api/v3/team/frc9000/years_participated': [2025],
        '/api/v3/team/frc254/events/2025/simple': [{ key: '2025cacc' }],
        '/api/v3/team/frc9000/events/2025/simple': [],
      };
      return { ok: true, json: async () => bodies[path] };
    };

    await expect(createClassicRun(254, 9000, { authKey: 'key', fetchImpl, year: 2025 })).rejects.toThrow(
      'Both teams must have played at least one event in 2025.',
    );
  });

  it('skips shared classic years unless both teams have event records', async () => {
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      const bodies = {
        '/api/v3/team/frc254/years_participated': [2024, 2025],
        '/api/v3/team/frc1678/years_participated': [2024, 2025],
        '/api/v3/team/frc254/events/2024/simple': [],
        '/api/v3/team/frc1678/events/2024/simple': [{ key: '2024cada' }],
        '/api/v3/team/frc254/events/2025/simple': [{ key: '2025cacc' }],
        '/api/v3/team/frc1678/events/2025/simple': [{ key: '2025cada' }],
        '/api/v3/team/frc254': { key: 'frc254', team_number: 254, nickname: 'The Cheesy Poofs' },
        '/api/v3/team/frc1678': { key: 'frc1678', team_number: 1678, nickname: 'Citrus Circuits' },
        '/api/v3/team/frc254/districts': [],
        '/api/v3/team/frc1678/districts': [],
      };
      return { ok: true, json: async () => bodies[path] };
    };

    const run = await createClassicRun(254, 1678, {
      authKey: 'key',
      fetchImpl,
      random: () => 0,
    });

    expect(run.year).toBe(2025);
  });

  it('retries full random runs until both teams played in the selected year', async () => {
    const teams = [
      { key: 'frc1', team_number: 1, nickname: 'One' },
      { key: 'frc2', team_number: 2, nickname: 'Two' },
      { key: 'frc3', team_number: 3, nickname: 'Three' },
    ];
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      const played = {
        '/api/v3/team/frc1/events/2025/simple': [],
        '/api/v3/team/frc2/events/2025/simple': [{ key: '2025one' }],
        '/api/v3/team/frc3/events/2025/simple': [{ key: '2025two' }],
      };
      return { ok: true, json: async () => played[path] };
    };
    const values = [0, 0, 0.4, 0.9];
    const run = await pickRandomPlayedRun(teams, {
      authKey: 'key',
      fetchImpl,
      random: () => values.shift(),
      year: 2025,
    });

    expect(run.start.team_number).toBe(2);
    expect(run.target.team_number).toBe(3);
  });
});
