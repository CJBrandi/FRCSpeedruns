export function formatElapsed(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const seconds = Math.floor(total / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  const minutes = Math.floor(seconds / 60);
  const displaySeconds = seconds % 60;
  if (minutes > 0) return `${minutes}:${String(displaySeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  return `${displaySeconds}.${String(hundredths).padStart(2, '0')}s`;
}

export function normalizeTeamInput(value) {
  const match = String(value ?? '').trim().toLowerCase().match(/^(?:frc)?(\d{1,5})$/);
  return match ? Number(match[1]) : null;
}

export function normalizeYearInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^\d{4}$/);
  return match ? Number(match[0]) : null;
}

export function teamPath(teamNumber) {
  return `/team/${teamNumber}`;
}

export function teamYearPath(teamNumber, year) {
  return `/team/${teamNumber}/${year}`;
}

export function proxyUrl(path, year) {
  const yearPart = year ? `&year=${encodeURIComponent(year)}` : '';
  return `/proxy?path=${encodeURIComponent(path || '/')}${yearPart}`;
}

export function teamFromPath(path) {
  const match = String(path ?? '').match(/^\/team\/(\d{1,5})(?:\/.*)?$/);
  return match ? Number(match[1]) : null;
}

export function pathFromProxyLocation(href) {
  const url = new URL(href, window.location.origin);
  return url.searchParams.get('path') || '/';
}

export function createRun({ startTeam, targetTeam, startName, targetName, startRegion, targetRegion, year }) {
  if (!startTeam || !targetTeam) throw new Error('Choose a valid start and goal team.');
  if (startTeam === targetTeam) throw new Error('Start and goal teams must be different.');
  if (!year) throw new Error('Choose a valid FRC season.');

  return {
    id: crypto.randomUUID(),
    year,
    startTeam,
    targetTeam,
    startName: startName || `Team ${startTeam}`,
    targetName: targetName || `Team ${targetTeam}`,
    startRegion: startRegion || '',
    targetRegion: targetRegion || '',
    startedAt: Date.now(),
    currentPath: teamYearPath(startTeam, year),
    currentTeam: startTeam,
    linksClicked: 0,
    completed: false,
  };
}

export function advanceRun(run, nextPath) {
  if (!run || run.completed) return run;
  const normalizedPath = nextPath || '/';
  if (normalizedPath === run.currentPath) return run;

  const currentTeam = teamFromPath(normalizedPath);
  if (!currentTeam) return run;

  const reachedTarget = currentTeam === run.targetTeam;

  return {
    ...run,
    currentPath: normalizedPath,
    currentTeam,
    linksClicked: run.linksClicked + 1,
    completed: reachedTarget,
    completedAt: reachedTarget ? Date.now() : undefined,
  };
}

export function runResult(run) {
  const finishedAt = run.completedAt || Date.now();
  return {
    id: run.id,
    startTeam: run.startTeam,
    targetTeam: run.targetTeam,
    startName: run.startName,
    targetName: run.targetName,
    startRegion: run.startRegion,
    targetRegion: run.targetRegion,
    year: run.year,
    linksClicked: run.linksClicked,
    elapsedMs: finishedAt - run.startedAt,
    completedAt: new Date(finishedAt).toISOString(),
  };
}

export function loadHistory(storage = window.localStorage) {
  try {
    return JSON.parse(storage.getItem('frc-wikirun-history') || '[]');
  } catch {
    return [];
  }
}

export function saveHistory(history, storage = window.localStorage) {
  storage.setItem('frc-wikirun-history', JSON.stringify(history.slice(0, 20)));
}
