import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createClassicRun,
  fetchTbaPage,
  fetchTbaTeams,
  fetchTeamWithRegion,
  fetchTeamDistrictForYear,
  normalizeTeam,
  pickRandomPlayedRun,
  pickRandomYear,
  resolveTbaPath,
} from './tba.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/random-run', async (_request, response) => {
  try {
    const year = pickRandomYear();
    const teams = await fetchTbaTeams({
      authKey: process.env.TBA_AUTH_KEY,
      sampleFallback: process.env.TBA_SAMPLE_FALLBACK === '1',
      year,
    });
    const run = await pickRandomPlayedRun(teams, {
      authKey: process.env.TBA_AUTH_KEY,
      random: Math.random,
      year,
    });
    if (process.env.TBA_AUTH_KEY) {
      const [startDistrict, targetDistrict] = await Promise.all([
        fetchTeamDistrictForYear(run.start.key, year, process.env.TBA_AUTH_KEY).catch(() => null),
        fetchTeamDistrictForYear(run.target.key, year, process.env.TBA_AUTH_KEY).catch(() => null),
      ]);
      run.start = normalizeTeam(run.start, startDistrict);
      run.target = normalizeTeam(run.target, targetDistrict);
    }
    response.json(run);
  } catch (error) {
    response.status(503).json({ error: error.message });
  }
});

app.get('/api/classic-run', async (request, response) => {
  try {
    const start = Number(request.query.start);
    const target = Number(request.query.target);
    const year = request.query.year ? Number(request.query.year) : undefined;
    response.json(
      await createClassicRun(start, target, {
        authKey: process.env.TBA_AUTH_KEY,
        year,
      }),
    );
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/team-region', async (request, response) => {
  try {
    const team = Number(request.query.team);
    const year = Number(request.query.year);
    if (!team || !year) {
      response.status(400).json({ error: 'team and year query parameters are required.' });
      return;
    }
    response.json(await fetchTeamWithRegion(team, year, process.env.TBA_AUTH_KEY));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/proxy', async (request, response) => {
  try {
    const tbaPath = resolveTbaPath(request.query.path);
    if (!tbaPath) {
      response.status(400).send('Only The Blue Alliance paths can be proxied.');
      return;
    }

    const year = request.query.year ? Number(request.query.year) : undefined;
    const html = await fetchTbaPage(tbaPath, { year });
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.send(html);
  } catch (error) {
    response.status(error.status || 502).send(error.message);
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
}

app.listen(port, '127.0.0.1', () => {
  console.log(`FRC WikiRun server listening on http://127.0.0.1:${port}`);
});
