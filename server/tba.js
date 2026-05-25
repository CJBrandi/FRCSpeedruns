const TBA_ORIGIN = 'https://www.thebluealliance.com';
const FIRST_FRC_YEAR = 2002;
const TBA_MAX_TEAM_PAGE = 30;
const teamYearCache = new Map();

export const SAMPLE_TEAMS = [
  { key: 'frc16', team_number: 16, nickname: 'Baxter Bomb Squad', state_prov: 'Arkansas', country: 'USA', rookie_year: 1996 },
  { key: 'frc67', team_number: 67, nickname: 'The HOT Team', state_prov: 'Michigan', country: 'USA', rookie_year: 1997 },
  { key: 'frc1114', team_number: 1114, nickname: 'Simbotics', state_prov: 'Ontario', country: 'Canada', rookie_year: 2003 },
  { key: 'frc1678', team_number: 1678, nickname: 'Citrus Circuits', state_prov: 'California', country: 'USA', rookie_year: 2005 },
  { key: 'frc2056', team_number: 2056, nickname: 'OP Robotics', state_prov: 'Ontario', country: 'Canada', rookie_year: 2007 },
  { key: 'frc254', team_number: 254, nickname: 'The Cheesy Poofs', state_prov: 'California', country: 'USA', rookie_year: 1999 },
  { key: 'frc2910', team_number: 2910, nickname: 'Jack in the Bot', state_prov: 'Washington', country: 'USA', rookie_year: 2009 },
  { key: 'frc4414', team_number: 4414, nickname: 'HighTide', state_prov: 'California', country: 'USA', rookie_year: 2012 },
  { key: 'frc6328', team_number: 6328, nickname: 'Mechanical Advantage', state_prov: 'Massachusetts', country: 'USA', rookie_year: 2017 },
  { key: 'frc971', team_number: 971, nickname: 'Spartan Robotics', state_prov: 'California', country: 'USA', rookie_year: 2002 },
];

export function normalizeTeamNumber(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = raw.match(/^(?:frc)?(\d{1,5})$/);
  return match ? Number(match[1]) : null;
}

export function teamPath(teamNumber) {
  return `/team/${teamNumber}`;
}

export function teamYearPath(teamNumber, year) {
  return `/team/${teamNumber}/${year}`;
}

export function getTeamFromPath(path) {
  const match = String(path ?? '').match(/^\/team\/(\d{1,5})(?:\/.*)?$/);
  return match ? Number(match[1]) : null;
}

export function currentFrcYear(now = new Date()) {
  return now.getFullYear();
}

export function isValidFrcYear(year, now = new Date()) {
  return Number.isInteger(year) && year >= FIRST_FRC_YEAR && year <= currentFrcYear(now);
}

export function pickRandomYear(random = Math.random, now = new Date()) {
  const current = currentFrcYear(now);
  return FIRST_FRC_YEAR + Math.floor(random() * (current - FIRST_FRC_YEAR + 1));
}

export function summarizeRegion(team, district) {
  if (district?.display_name) return district.display_name;
  return [team?.state_prov, team?.country].filter(Boolean).join(', ') || 'Unknown region';
}

export function normalizeTeam(team, district) {
  return {
    key: team.key,
    team_number: Number(team.team_number),
    nickname: team.nickname || `Team ${team.team_number}`,
    state_prov: team.state_prov || '',
    country: team.country || '',
    region: summarizeRegion(team, district),
  };
}

export function pickRandomRun(teams, random = Math.random, year = currentFrcYear()) {
  if (!Array.isArray(teams) || teams.length < 2) {
    throw new Error('At least two teams are required to create a run.');
  }

  const normalized = teams
    .map((team) => normalizeTeam(team))
    .filter((team) => Number.isInteger(team.team_number));

  if (normalized.length < 2) {
    throw new Error('At least two valid teams are required to create a run.');
  }

  const startIndex = Math.floor(random() * normalized.length);
  let targetIndex = Math.floor(random() * (normalized.length - 1));
  if (targetIndex >= startIndex) targetIndex += 1;

  return {
    year,
    start: normalized[startIndex],
    target: normalized[targetIndex],
  };
}

export async function fetchTbaJson(path, authKey, fetchImpl = fetch) {
  const response = await fetchImpl(`${TBA_ORIGIN}${path}`, {
    headers: { 'X-TBA-Auth-Key': authKey },
  });

  if (!response.ok) {
    throw new Error(`TBA request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function fetchTbaTeams({ authKey, fetchImpl = fetch, sampleFallback = false, year = currentFrcYear() } = {}) {
  if (!authKey) {
    if (sampleFallback) return SAMPLE_TEAMS.filter((team) => !team.rookie_year || team.rookie_year <= year);
    throw new Error('Missing TBA_AUTH_KEY. Add it to .env to enable random runs from live TBA data.');
  }

  const cacheKey = `${year}:${authKey}`;
  if (fetchImpl === fetch && teamYearCache.has(cacheKey)) return teamYearCache.get(cacheKey);

  const pageNumbers = Array.from({ length: TBA_MAX_TEAM_PAGE + 1 }, (_, page) => page);
  const pages = await Promise.all(pageNumbers.map((page) => fetchTbaJson(`/api/v3/teams/${year}/${page}/simple`, authKey, fetchImpl)));
  const teams = pages.flatMap((pageTeams) => (Array.isArray(pageTeams) ? pageTeams : []));

  if (fetchImpl === fetch) teamYearCache.set(cacheKey, teams);
  return teams;
}

export async function fetchTeamDistrictForYear(teamKey, year, authKey, fetchImpl = fetch) {
  if (!authKey) return null;
  const districts = await fetchTbaJson(`/api/v3/team/${teamKey}/districts`, authKey, fetchImpl);
  return districts.find((district) => district.year === year) || null;
}

export async function fetchTeamEventsForYear(teamNumber, year, authKey, fetchImpl = fetch) {
  if (!authKey) {
    const sample = SAMPLE_TEAMS.find((team) => team.team_number === teamNumber);
    return sample && (!sample.rookie_year || sample.rookie_year <= year) ? [{ key: `${year}sample` }] : [];
  }

  return fetchTbaJson(`/api/v3/team/frc${teamNumber}/events/${year}/simple`, authKey, fetchImpl);
}

export async function teamPlayedInYear(teamNumber, year, authKey, fetchImpl = fetch) {
  const events = await fetchTeamEventsForYear(teamNumber, year, authKey, fetchImpl);
  return Array.isArray(events) && events.length > 0;
}

export async function fetchTeamWithRegion(teamNumber, year, authKey, fetchImpl = fetch) {
  if (!authKey) {
    const sample = SAMPLE_TEAMS.find((team) => team.team_number === teamNumber);
    if (!sample) throw new Error('Missing TBA_AUTH_KEY. Add it to .env to enable team metadata.');
    return normalizeTeam(sample);
  }

  const team = await fetchTbaJson(`/api/v3/team/frc${teamNumber}`, authKey, fetchImpl);
  const district = await fetchTeamDistrictForYear(team.key, year, authKey, fetchImpl);
  return normalizeTeam(team, district);
}

export async function fetchCommonYears(startTeam, targetTeam, authKey, fetchImpl = fetch) {
  if (!authKey) throw new Error('Missing TBA_AUTH_KEY. Add it to .env to enable classic runs.');

  const [startYears, targetYears] = await Promise.all([
    fetchTbaJson(`/api/v3/team/frc${startTeam}/years_participated`, authKey, fetchImpl),
    fetchTbaJson(`/api/v3/team/frc${targetTeam}/years_participated`, authKey, fetchImpl),
  ]);

  const targetSet = new Set(targetYears);
  return startYears.filter((year) => targetSet.has(year));
}

export async function requireTeamsPlayedInYear(startTeam, targetTeam, year, authKey, fetchImpl = fetch) {
  if (!isValidFrcYear(year)) throw new Error('Choose a valid FRC season.');

  const [startPlayed, targetPlayed] = await Promise.all([
    teamPlayedInYear(startTeam, year, authKey, fetchImpl),
    teamPlayedInYear(targetTeam, year, authKey, fetchImpl),
  ]);

  if (!startPlayed || !targetPlayed) {
    throw new Error(`Both teams must have played at least one event in ${year}.`);
  }
}

export async function createClassicRun(startTeam, targetTeam, { authKey, fetchImpl = fetch, random = Math.random, year: requestedYear } = {}) {
  if (!startTeam || !targetTeam) throw new Error('Choose a valid start and goal team.');
  if (startTeam === targetTeam) throw new Error('Start and goal teams must be different.');
  if (requestedYear && !isValidFrcYear(Number(requestedYear))) throw new Error('Choose a valid FRC season.');

  const years = await fetchCommonYears(startTeam, targetTeam, authKey, fetchImpl);
  if (years.length === 0) throw new Error('Those teams do not share an FRC season on TBA.');

  if (requestedYear) {
    const year = Number(requestedYear);
    if (!years.includes(year)) throw new Error(`Both teams must have played at least one event in ${year}.`);
    await requireTeamsPlayedInYear(startTeam, targetTeam, year, authKey, fetchImpl);
    const [start, target] = await Promise.all([
      fetchTeamWithRegion(startTeam, year, authKey, fetchImpl),
      fetchTeamWithRegion(targetTeam, year, authKey, fetchImpl),
    ]);

    return { year, start, target };
  }

  const candidateYears = [...years];
  let year = null;
  while (candidateYears.length > 0) {
    const index = Math.floor(random() * candidateYears.length);
    const candidate = candidateYears.splice(index, 1)[0];
    try {
      await requireTeamsPlayedInYear(startTeam, targetTeam, candidate, authKey, fetchImpl);
      year = candidate;
      break;
    } catch {
      // Try another shared season; TBA participation years can outlive event records.
    }
  }

  if (!year) throw new Error('Those teams do not share an FRC season with event records on TBA.');

  const [start, target] = await Promise.all([
    fetchTeamWithRegion(startTeam, year, authKey, fetchImpl),
    fetchTeamWithRegion(targetTeam, year, authKey, fetchImpl),
  ]);

  return { year, start, target };
}

export async function pickRandomPlayedRun(teams, { authKey, fetchImpl = fetch, random = Math.random, year = currentFrcYear(), maxAttempts = 20 } = {}) {
  let lastRun = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const run = pickRandomRun(teams, random, year);
    lastRun = run;
    const [startPlayed, targetPlayed] = await Promise.all([
      teamPlayedInYear(run.start.team_number, year, authKey, fetchImpl),
      teamPlayedInYear(run.target.team_number, year, authKey, fetchImpl),
    ]);
    if (startPlayed && targetPlayed) return run;
  }

  if (lastRun) throw new Error(`Could not find two teams that played at least one event in ${year}.`);
  throw new Error('At least two teams are required to create a run.');
}

export function resolveTbaPath(input) {
  const raw = String(input || '/').trim();
  if (!raw || raw === '/') return '/';

  try {
    const parsed = new URL(raw, TBA_ORIGIN);
    if (parsed.origin !== TBA_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function isTeamsTab(path) {
  return /^\/teams(?:\/.*)?$/.test(String(path || ''));
}

export function pathMatchesYear(path, year) {
  const raw = String(path || '');
  if (raw === '/' || raw === '') return false;
  if (isTeamsTab(raw)) return false;

  const teamMatch = raw.match(/^\/team\/(\d{1,5})(?:\/(\d{4}))?(?:\/.*)?$/);
  if (teamMatch) return !teamMatch[2] || Number(teamMatch[2]) === Number(year);

  return false;
}

export function normalizePathForYear(path, year) {
  const raw = String(path || '/');
  if (isTeamsTab(raw)) return null;

  const teamMatch = raw.match(/^\/team\/(\d{1,5})(?:\/\d{4})?(\/.*)?$/);
  if (teamMatch) return `/team/${teamMatch[1]}/${year}${teamMatch[2] || ''}`;

  if (!pathMatchesYear(raw, year)) return null;
  return raw;
}

export function rewriteTbaHtml(html, { year } = {}) {
  const withBase = String(html).replace(/\s(?:integrity|nonce)="[^"]*"/gi, '');

  const withRewrittenAnchors = withBase.replace(
    /<a\b([^>]*?)\shref=["']([^"']+)["']([^>]*)>/gi,
    (full, before, value, after) => {
      const safeBefore = before.replace(/\starget=["'][^"']*["']/gi, '');
      const safeAfter = after.replace(/\starget=["'][^"']*["']/gi, '');
      const lower = value.toLowerCase();
      if (
        lower.startsWith('mailto:') ||
        lower.startsWith('tel:') ||
        lower.startsWith('javascript:') ||
        lower.startsWith('#')
      ) {
        return `<a${safeBefore} href="${value}"${safeAfter}>`;
      }

      let url;
      try {
        url = new URL(value, TBA_ORIGIN);
      } catch {
        return full;
      }

      if (url.origin !== TBA_ORIGIN) {
        return `<a${safeBefore} href="#" data-frc-speedrun-blocked="${url.href}"${safeAfter}>`;
      }

      const originalPath = `${url.pathname}${url.search}${url.hash}`;
      const proxiedPath = year ? normalizePathForYear(originalPath, year) : originalPath;
      if (!proxiedPath) {
        const reason = isTeamsTab(originalPath)
          ? 'Teams tab is blocked during a run.'
          : `Only team pages for ${year} are allowed during this run.`;
        return `<a${safeBefore} href="#" data-frc-speedrun-blocked-route="${reason}"${safeAfter}>`;
      }

      const yearPart = year ? `&year=${encodeURIComponent(year)}` : '';
      return `<a${safeBefore} href="/proxy?path=${encodeURIComponent(proxiedPath)}${yearPart}"${safeAfter}>`;
    },
  );

  const rewritten = withRewrittenAnchors.replace(
    /<(link|script|img|source|video|audio|iframe)\b([^>]*?)\s(href|src)=["']([^"']+)["']([^>]*)>/gi,
    (full, tag, before, attr, value, after) => {
      const lower = value.toLowerCase();
      if (
        lower.startsWith('data:') ||
        lower.startsWith('mailto:') ||
        lower.startsWith('tel:') ||
        lower.startsWith('javascript:')
      ) {
        return full;
      }

      try {
        const url = new URL(value, TBA_ORIGIN);
        return `<${tag}${before} ${attr}="${url.href}"${after}>`;
      } catch {
        return full;
      }
    },
  );

  const guardScript = `
<script>
(() => {
  const currentPath = () => new URL(window.location.href).searchParams.get('path') || '/';
  const blockRoute = (reason) => window.parent.postMessage({ type: 'frc-speedrun-blocked-route', reason }, window.location.origin);
  window.parent.postMessage({ type: 'frc-speedrun-page-load', path: currentPath() }, window.location.origin);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      window.alert('Find is blocked during FRC WikiRun. Use only links inside the embedded TBA page.');
    }
  }, true);
  document.addEventListener('submit', (event) => {
    event.preventDefault();
    blockRoute('Search and year controls are blocked during a run.');
  }, true);
  document.querySelectorAll('input[type="search"], input[name="q"], select[name*="year" i], input[name*="year" i]').forEach((control) => {
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
    control.setAttribute('data-frc-speedrun-locked-control', 'true');
  });
  document.addEventListener('change', (event) => {
    const control = event.target.closest && event.target.closest('select[name*="year" i], input[name*="year" i]');
    if (!control) return;
    event.preventDefault();
    blockRoute('Search and year controls are blocked during a run.');
  }, true);
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a');
    if (!link) return;
    link.target = '_self';
    const blocked = link.getAttribute('data-frc-speedrun-blocked');
    if (blocked) {
      event.preventDefault();
      window.parent.postMessage({ type: 'frc-speedrun-blocked-link', url: blocked }, window.location.origin);
      return;
    }
    const blockedRoute = link.getAttribute('data-frc-speedrun-blocked-route');
    if (blockedRoute) {
      event.preventDefault();
      window.parent.postMessage({ type: 'frc-speedrun-blocked-route', reason: blockedRoute }, window.location.origin);
      return;
    }
    if (link.href && link.href.startsWith(window.location.origin + '/proxy')) {
      const path = new URL(link.href).searchParams.get('path') || '/';
      window.parent.postMessage({ type: 'frc-speedrun-navigation', path }, window.location.origin);
    }
  }, true);
})();
</script>`;

  return rewritten.replace(/<\/body>/i, `${guardScript}</body>`);
}

export async function fetchTbaPage(path, { year, fetchImpl = fetch } = {}) {
  const resolvedPath = year ? normalizePathForYear(resolveTbaPath(path), year) : resolveTbaPath(path);
  if (!resolvedPath) {
    const error = new Error(
      year ? `Only ${year} The Blue Alliance team pages can be proxied for this run.` : 'Only The Blue Alliance paths can be proxied.',
    );
    error.status = 400;
    throw error;
  }

  const response = await fetchImpl(`${TBA_ORIGIN}${resolvedPath}`, {
    headers: {
      'User-Agent': 'FRC WikiRun local speedrun app',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    const error = new Error(`TBA page request failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return rewriteTbaHtml(await response.text(), { year });
}
