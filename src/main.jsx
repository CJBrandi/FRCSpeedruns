import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  advanceRun,
  createRun,
  formatElapsed,
  loadHistory,
  normalizeTeamInput,
  normalizeYearInput,
  pathFromProxyLocation,
  proxyUrl,
  runResult,
  saveHistory,
} from './game.js';
import './styles.css';

function App() {
  const [startTeam, setStartTeam] = useState('');
  const [targetTeam, setTargetTeam] = useState('');
  const [seasonYear, setSeasonYear] = useState('');
  const [setupRun, setSetupRun] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [setupFrameReady, setSetupFrameReady] = useState(false);
  const [run, setRun] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState(() => loadHistory());
  const [error, setError] = useState('');
  const [blockedWarning, setBlockedWarning] = useState(null);
  const [currentRegion, setCurrentRegion] = useState('');
  const iframeRef = useRef(null);
  const lastFramePath = useRef(null);
  const regionCache = useRef(new Map());

  const active = Boolean(run && !run.completed);
  const visibleRun = run || setupRun?.run || null;
  const iframeSrc = useMemo(() => (visibleRun ? proxyUrl(visibleRun.currentPath, visibleRun.year) : ''), [visibleRun]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - run.startedAt);
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, run]);

  useEffect(() => {
    if (!setupRun?.run) return undefined;
    setCountdown(3);
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setupRun?.run?.id]);

  useEffect(() => {
    if (!setupRun?.run || countdown > 0 || !setupFrameReady) return;
    startPreparedRun();
  }, [setupRun?.run, countdown, setupFrameReady]);

  useEffect(() => {
    if (!setupRun?.run) return undefined;
    const onKeyDown = (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      startPreparedRun();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setupRun?.run]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!active) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        window.alert('Find is blocked during FRC WikiRun. Use only links inside the embedded TBA page.');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'frc-speedrun-blocked-link') {
        setBlockedWarning({ id: crypto.randomUUID(), message: `External link blocked: ${event.data.url}` });
      }
      if (event.data?.type === 'frc-speedrun-blocked-route') {
        setBlockedWarning({ id: crypto.randomUUID(), message: event.data.reason });
      }
      if (event.data?.type === 'frc-speedrun-navigation' || event.data?.type === 'frc-speedrun-page-load') {
        handleFramePath(event.data.path);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [run]);

  useEffect(() => {
    if (!blockedWarning) return undefined;
    const timer = window.setTimeout(() => setBlockedWarning(null), 3000);
    return () => window.clearTimeout(timer);
  }, [blockedWarning]);

  useEffect(() => {
    if (!run?.completed) return;
    const result = runResult(run);
    const nextHistory = [result, ...history].slice(0, 20);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    setElapsed(result.elapsedMs);
  }, [run?.completed]);

  useEffect(() => {
    if (!active || !run.currentTeam) {
      setCurrentRegion('');
      return undefined;
    }

    const key = `${run.year}:${run.currentTeam}`;
    if (regionCache.current.has(key)) {
      setCurrentRegion(regionCache.current.get(key));
      return undefined;
    }

    const controller = new AbortController();
    fetch(`/api/team-region?team=${run.currentTeam}&year=${run.year}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((team) => {
        if (!team) return;
        regionCache.current.set(key, team.region || '');
        setCurrentRegion(team.region || '');
      })
      .catch(() => {});

    return () => controller.abort();
  }, [active, run?.currentTeam, run?.year]);

  function beginRun(nextRun) {
    lastFramePath.current = nextRun.currentPath;
    setElapsed(0);
    setBlockedWarning(null);
    setCurrentRegion(nextRun.startRegion || '');
    setError('');
    setRun(nextRun);
  }

  function prepareRunFromBody(body) {
    return createRun({
      year: body.year,
      startTeam: body.start.team_number,
      targetTeam: body.target.team_number,
      startName: `${body.start.team_number} ${body.start.nickname}`,
      targetName: `${body.target.team_number} ${body.target.nickname}`,
      startRegion: body.start.region,
      targetRegion: body.target.region,
    });
  }

  function startPreparedRun() {
    if (!setupRun?.run) return;
    const nextRun = {
      ...setupRun.run,
      startedAt: Date.now(),
    };
    setSetupRun(null);
    setSetupFrameReady(false);
    beginRun(nextRun);
  }

  function startSetup(label, detail) {
    setRun(null);
    setError('');
    setBlockedWarning(null);
    setCountdown(3);
    setSetupFrameReady(false);
    setSetupRun({ label, detail, run: null });
  }

  async function startClassicRun(event) {
    event.preventDefault();
    const label = seasonYear.trim() ? 'Manual season run' : 'Classic random-season run';
    startSetup(label, 'Checking team event history and preparing The Blue Alliance page.');
    try {
      const normalizedStart = normalizeTeamInput(startTeam);
      const normalizedTarget = normalizeTeamInput(targetTeam);
      const normalizedYear = normalizeYearInput(seasonYear);
      if (!normalizedStart || !normalizedTarget) throw new Error('Choose a valid start and goal team.');
      if (seasonYear.trim() && !normalizedYear) throw new Error('Choose a valid 4-digit FRC season.');
      if (normalizedStart === normalizedTarget) throw new Error('Start and goal teams must be different.');

      const yearPart = normalizedYear ? `&year=${normalizedYear}` : '';
      const response = await fetch(`/api/classic-run?start=${normalizedStart}&target=${normalizedTarget}${yearPart}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create a classic run.');

      setSetupRun((current) => ({ ...current, run: prepareRunFromBody(body) }));
    } catch (runError) {
      setSetupRun(null);
      setError(runError.message);
    }
  }

  async function startRandomRun() {
    startSetup('Full random run', 'Choosing a season and two teams that both played events that year.');
    try {
      const response = await fetch('/api/random-run');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create a random run.');

      setSetupRun((current) => ({ ...current, run: prepareRunFromBody(body) }));
    } catch (randomError) {
      setSetupRun(null);
      setError(randomError.message);
    }
  }

  function giveUp() {
    setRun(null);
    setSetupRun(null);
    setSetupFrameReady(false);
    setElapsed(0);
    setCurrentRegion('');
    setBlockedWarning(null);
    lastFramePath.current = null;
  }

  function handleFramePath(nextPath) {
    if (!run || run.completed || !nextPath) return;
    if (nextPath === lastFramePath.current) return;
    lastFramePath.current = nextPath;
    setRun((currentRun) => advanceRun(currentRun, nextPath));
  }

  function handleFrameLoad() {
    if (setupRun?.run && !run) {
      setSetupFrameReady(true);
      return;
    }
    if (!iframeRef.current || !run || run.completed) return;

    let nextPath;
    try {
      nextPath = pathFromProxyLocation(iframeRef.current.contentWindow.location.href);
    } catch {
      setError('Run abandoned because the page left the local TBA proxy.');
      giveUp();
      return;
    }

    handleFramePath(nextPath);
  }

  return (
    <main className={visibleRun || setupRun ? 'app app--playing' : 'app'}>
      {!visibleRun && !setupRun && (
        <section className="home">
          <nav className="top-nav">
            <div className="brand">
              <span className="brand-mark">FRC</span>
              <span>
                <strong>WikiRun</strong>
                <small>TBA Speedruns</small>
              </span>
            </div>
            <a href="https://www.thebluealliance.com/apidocs" target="_blank" rel="noreferrer">
              TBA API
            </a>
          </nav>

          <section className="challenge-hero">
            <div>
              <p className="eyebrow">Local solo speedruns</p>
              <h1>Race through The Blue Alliance.</h1>
              <p className="intro">
                Start on one FRC team page and reach the goal team using only links inside one randomized FRC season.
              </p>
            </div>
            <button className="primary-action" onClick={startRandomRun}>
              Random Run
            </button>
          </section>

          {error && <div className="notice notice--error">{error}</div>}

          <section className="challenge-grid">
            <form className="panel setup-panel" onSubmit={startClassicRun}>
              <div className="panel-heading">
                <span>Classic</span>
                <strong>{seasonYear.trim() ? 'Manual year' : 'Random year'}</strong>
              </div>
              <label>
                Start team
                <input value={startTeam} onChange={(event) => setStartTeam(event.target.value)} placeholder="Eg. 254" />
              </label>
              <label>
                Goal team
                <input value={targetTeam} onChange={(event) => setTargetTeam(event.target.value)} placeholder="Eg. 1678" />
              </label>
              <label>
                Year
                <input value={seasonYear} onChange={(event) => setSeasonYear(event.target.value)} placeholder="Eg. 2025" />
              </label>
              <button type="submit">Start Run</button>
            </form>

            <section className="panel rules-panel">
              <div className="panel-heading">
                <span>Rules</span>
                <strong>Strict solo</strong>
              </div>
              <ul>
                <li>Only proxied TBA links count.</li>
                <li>The Teams tab is blocked.</li>
                <li>Every run is locked to one random year.</li>
                <li>External links are blocked during a run.</li>
                <li>Ctrl+F is blocked while playing.</li>
              </ul>
            </section>

            <section className="panel history-panel">
              <div className="panel-heading">
                <span>Recent local runs</span>
                <strong>{history.length ? `${history.length} saved` : 'No runs yet'}</strong>
              </div>
              <div className="history-list">
                {history.length === 0 && <p>Finished runs will appear here.</p>}
                {history.slice(0, 5).map((item) => (
                  <article key={item.id} className="history-item">
                    <span>
                      {item.startTeam} → {item.targetTeam} · {item.year}
                    </span>
                    <strong>{formatElapsed(item.elapsedMs)}</strong>
                    <small>{item.linksClicked} links</small>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </section>
      )}

      {(visibleRun || setupRun) && (
        <section className="run-screen">
          {visibleRun && (
            <iframe
              ref={iframeRef}
              title="The Blue Alliance speedrun page"
              src={iframeSrc}
              onLoad={handleFrameLoad}
              sandbox="allow-scripts allow-same-origin"
            />
          )}

          {setupRun && (
            <div className="start-overlay">
              <nav className="start-overlay-nav">
                <div className="brand">
                  <span className="brand-mark">FRC</span>
                  <span>
                    <strong>WikiRun</strong>
                    <small>TBA Speedruns</small>
                  </span>
                </div>
              </nav>

              <section className="start-countdown" aria-live="polite">
                <p>{setupRun.label}</p>
                {setupRun.run ? (
                  <>
                    <h2>
                      Starting Team: <strong>{setupRun.run.startTeam}</strong>
                    </h2>
                    <h2>
                      Goal Team: <strong>{setupRun.run.targetTeam}</strong>
                    </h2>
                    <p>
                      Season: <strong>{setupRun.run.year}</strong>
                    </p>
                    <button type="button" onClick={startPreparedRun}>
                      Click here or press spacebar to start immediately
                    </button>
                    <strong className="countdown-number">{setupFrameReady ? countdown : '...'}</strong>
                  </>
                ) : (
                  <>
                    <h2>{setupRun.detail}</h2>
                    <strong className="countdown-number">...</strong>
                  </>
                )}
              </section>
            </div>
          )}

          {active && (
            <aside className="run-island" aria-label="Active run status">
              <div>
                <span>Goal</span>
                <strong>{run.targetTeam}</strong>
                <small>{run.targetRegion}</small>
              </div>
              <div>
                <span>Time</span>
                <strong>{formatElapsed(elapsed)}</strong>
                <small>{run.year}</small>
              </div>
              <button onClick={giveUp}>Give Up</button>
              <div>
                <span>Current</span>
                <strong>{run.currentTeam || 'TBA'}</strong>
                <small>{currentRegion}</small>
              </div>
              <div>
                <span>Links</span>
                <strong>{run.linksClicked}</strong>
              </div>
            </aside>
          )}

          {run?.completed && (
            <div className="finish-dialog">
              <span>Finished</span>
              <h2>
                {run.startTeam} → {run.targetTeam}
              </h2>
              <p>
                {formatElapsed(elapsed)} · {run.linksClicked} links
              </p>
              <button onClick={() => setRun(null)}>Back Home</button>
            </div>
          )}

          {blockedWarning && <div className="blocked-toast">{blockedWarning.message}</div>}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
