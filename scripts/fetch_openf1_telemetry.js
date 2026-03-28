import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = 'https://api.openf1.org/v1';
const DEFAULT_START_YEAR = 2023;
const DEFAULT_CHUNK_MINUTES = 10;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const parseArg = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return fallback;
  return next;
};

const hasFlag = (flag) => process.argv.includes(flag);

const parseYears = () => {
  const arg = parseArg('--years', '');
  if (arg) {
    return arg.split(',').map(value => Number(value.trim())).filter(Boolean);
  }
  const currentYear = new Date().getUTCFullYear();
  const years = [];
  for (let year = DEFAULT_START_YEAR; year <= currentYear; year += 1) {
    years.push(year);
  }
  return years;
};

const parseList = (flag) => {
  const arg = parseArg(flag, '');
  if (!arg) return [];
  return arg.split(',').map(value => value.trim()).filter(Boolean);
};

const formatIso = (date) => date.toISOString();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const buildHeaders = (apiKey) => {
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
};

const fetchJson = async (url, apiKey, attempt = 1) => {
  const response = await fetch(url, { headers: buildHeaders(apiKey) });
  if (!response.ok) {
    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after') || 1);
      await sleep(retryAfter * 1000);
      return fetchJson(url, apiKey, attempt + 1);
    }
    if (attempt < 4) {
      await sleep(400 * attempt);
      return fetchJson(url, apiKey, attempt + 1);
    }
    const error = new Error(`OpenF1 request failed: ${response.status} ${response.statusText} (${url})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const buildUrl = (endpoint, params) => {
  const query = new URLSearchParams(params);
  return `${BASE_URL}/${endpoint}?${query.toString()}`;
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sanitize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const chunkRange = (start, end, minutes) => {
  const chunks = [];
  let cursor = new Date(start);
  const stepMs = minutes * 60 * 1000;
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + stepMs));
    chunks.push([new Date(cursor), new Date(next)]);
    cursor = next;
  }
  return chunks;
};

const appendJsonl = async (filePath, items) => {
  if (!items.length) return;
  const lines = items.map(item => JSON.stringify(item)).join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf-8');
};

const readJsonl = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) return [];
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const isFileComplete = async (filePath, endTimeMs, toleranceMs, driverEndMs) => {
  const lastTimestamp = await getLastTimestamp(filePath);
  if (lastTimestamp === null) return false;
  if (driverEndMs && lastTimestamp >= (driverEndMs - toleranceMs)) return true;
  return lastTimestamp >= (endTimeMs - toleranceMs);
};

const getLastTimestamp = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    const dateValue = last.date || last.date_start;
    if (!dateValue) return null;
    const time = new Date(dateValue).getTime();
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
};

const getMeetingsForYear = async (year, apiKey) => {
  const url = buildUrl('meetings', { year });
  try {
    const payload = await fetchJson(url, apiKey);
    await sleep(200);
    return payload;
  } catch (error) {
    console.warn(`[OpenF1] ${String(error.message || error)}`);
    return [];
  }
};

const getSessionsForMeeting = async (meetingKey, apiKey) => {
  const url = buildUrl('sessions', { meeting_key: meetingKey });
  try {
    const payload = await fetchJson(url, apiKey);
    await sleep(200);
    return payload;
  } catch (error) {
    console.warn(`[OpenF1] ${String(error.message || error)}`);
    return [];
  }
};

const getMeetingByKey = async (meetingKey, apiKey) => {
  const url = buildUrl('meetings', { meeting_key: meetingKey });
  try {
    const payload = await fetchJson(url, apiKey);
    await sleep(200);
    return payload[0] || null;
  } catch (error) {
    console.warn(`[OpenF1] ${String(error.message || error)}`);
    return null;
  }
};

const getSessionByKey = async (sessionKey, apiKey) => {
  const url = buildUrl('sessions', { session_key: sessionKey });
  try {
    const payload = await fetchJson(url, apiKey);
    await sleep(200);
    return payload[0] || null;
  } catch (error) {
    console.warn(`[OpenF1] ${String(error.message || error)}`);
    return null;
  }
};

const getDriversForSession = async (sessionKey, apiKey) => {
  const url = buildUrl('drivers', { session_key: sessionKey });
  try {
    const payload = await fetchJson(url, apiKey);
    await sleep(200);
    return payload.map(driver => driver.driver_number).filter(Boolean);
  } catch (error) {
    console.warn(`[OpenF1] ${String(error.message || error)}`);
    return [];
  }
};

const fetchTelemetryForSession = async ({
  meeting,
  session,
  outputDir,
  endpoints,
  chunkMinutes,
  limitChunks,
  drivers,
  resume,
  apiKey
}) => {
  const sessionDirName = `${session.session_key}-${sanitize(session.session_name || session.session_type || 'session')}`;
  const sessionDir = path.join(outputDir, String(session.meeting_key), sessionDirName);
  await ensureDir(sessionDir);

  await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify({ meeting, session }, null, 2));

  const start = session.date_start ? new Date(session.date_start) : new Date(meeting.date_start);
  const fallbackEnd = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const end = session.date_end ? new Date(session.date_end) : fallbackEnd;
  const chunks = chunkRange(start, end, chunkMinutes);
  const boundedChunks = typeof limitChunks === 'number' ? chunks.slice(0, limitChunks) : chunks;
  const driverScoped = new Set(['car_data', 'location']);
  const driverList = drivers && drivers.length ? drivers : [null];
  const completionToleranceMs = 2 * 60 * 1000;
  const lapsPath = path.join(sessionDir, 'laps.jsonl');
  const laps = await readJsonl(lapsPath);
  const driverLapEndMs = new Map();
  for (const lap of laps) {
    if (!lap.date_start || !lap.lap_duration) continue;
    const driverNumber = lap.driver_number;
    if (!driverNumber) continue;
    const lapEndMs = new Date(lap.date_start).getTime() + lap.lap_duration * 1000;
    const prev = driverLapEndMs.get(driverNumber) || 0;
    if (lapEndMs > prev) {
      driverLapEndMs.set(driverNumber, lapEndMs);
    }
  }

  for (const endpoint of endpoints) {
    const useDrivers = driverScoped.has(endpoint);
    const targets = useDrivers ? driverList : [null];
    const useDateRange = endpoint !== 'laps';

    for (const driverNumber of targets) {
      const suffix = driverNumber ? `-driver-${driverNumber}` : '';
      const fileKey = `${endpoint}${suffix}.jsonl`;
      const filePath = path.join(sessionDir, fileKey);
      const progressPath = path.join(sessionDir, 'progress.json');
      const hasFile = await fileExists(filePath);
      if (!resume || !hasFile) {
        await fs.writeFile(filePath, '');
      }
      if (resume && await fileExists(filePath)) {
        const driverEndMs = driverNumber ? driverLapEndMs.get(driverNumber) : null;
        const complete = await isFileComplete(filePath, end.getTime(), completionToleranceMs, driverEndMs);
        if (complete) {
          continue;
        }
      }
      let progress = {};
      if (resume && await fileExists(progressPath)) {
        try {
          progress = JSON.parse(await fs.readFile(progressPath, 'utf-8'));
        } catch {
          progress = {};
        }
      }
      if (resume && progress[fileKey] === 'ended') {
        continue;
      }
      const resumeFromMs = resume ? await getLastTimestamp(filePath) : null;
      if (!useDateRange) {
        const hasData = resumeFromMs !== null;
        if (resume && hasData) {
          continue;
        }
      }
      const chunkList = useDateRange
        ? (resumeFromMs
          ? boundedChunks.filter(([, chunkEnd]) => chunkEnd.getTime() > resumeFromMs)
          : boundedChunks)
        : [[start, end]];
      for (const [chunkStart, chunkEnd] of chunkList) {
        const effectiveStart = resumeFromMs && chunkStart.getTime() <= resumeFromMs && chunkEnd.getTime() > resumeFromMs
          ? new Date(resumeFromMs + 1)
          : chunkStart;
        const params = {
          session_key: session.session_key
        };
        if (useDateRange) {
          params['date>'] = formatIso(effectiveStart);
          params['date<'] = formatIso(chunkEnd);
        }
        if (useDrivers && driverNumber) {
          params.driver_number = driverNumber;
        }
        const url = buildUrl(endpoint, params);
        try {
          const payload = await fetchJson(url, apiKey);
          await appendJsonl(filePath, payload);
          if (resume) {
            progress[fileKey] = chunkEnd.toISOString();
            await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
          }
        } catch (error) {
          if (error.status === 404) {
            if (resume) {
              progress[fileKey] = 'ended';
              await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
            }
            break;
          }
          console.warn(`[OpenF1] ${String(error.message || error)}`);
        }
        await sleep(150);
      }
    }
  }
};

const main = async () => {
  const years = parseYears();
  const sessionType = parseArg('--session-type', 'Race');
  const endpoints = parseList('--endpoints');
  const chunkMinutes = Number(parseArg('--chunk-minutes', DEFAULT_CHUNK_MINUTES));
  const outputDir = parseArg('--out', path.join(ROOT_DIR, 'tests', 'openf1_telemetry'));
  const limitMeetings = parseArg('--limit-meetings', '');
  const limitSessions = parseArg('--limit-sessions', '');
  const limitChunks = parseArg('--limit-chunks', '');
  const dryRun = hasFlag('--dry-run');
  const circuitFilter = parseList('--circuits');
  const driverFilter = parseList('--drivers').map(value => Number(value)).filter(Boolean);
  const resume = !hasFlag('--no-resume');
  const apiKey = parseArg('--api-key', process.env.OPENF1_API_KEY || '');
  const meetingKeys = parseList('--meeting-keys').map(value => Number(value)).filter(Boolean);
  const sessionKeys = parseList('--session-keys').map(value => Number(value)).filter(Boolean);

  const targetEndpoints = endpoints.length ? endpoints : ['car_data', 'location', 'laps'];

  await ensureDir(outputDir);

  const meetingLimit = limitMeetings ? Number(limitMeetings) : null;
  const sessionLimit = limitSessions ? Number(limitSessions) : null;
  const chunkLimit = limitChunks ? Number(limitChunks) : null;

  if (sessionKeys.length) {
    for (const sessionKey of sessionKeys) {
      const session = await getSessionByKey(sessionKey, apiKey);
      if (!session) continue;
      const meeting = await getMeetingByKey(session.meeting_key, apiKey);
      if (!meeting) continue;
      if (dryRun) {
        console.log(`[Dry Run] Session ${session.session_key}:${session.session_name}`);
        continue;
      }
      const drivers = driverFilter.length ? driverFilter : await getDriversForSession(session.session_key, apiKey);
      await fetchTelemetryForSession({
        meeting,
        session,
        outputDir: path.join(outputDir, String(session.year)),
        endpoints: targetEndpoints,
        chunkMinutes,
        limitChunks: chunkLimit,
        drivers,
        resume,
        apiKey
      });
    }
    return;
  }

  if (meetingKeys.length) {
    for (const meetingKey of meetingKeys) {
      const meeting = await getMeetingByKey(meetingKey, apiKey);
      if (!meeting) continue;
      const sessions = await getSessionsForMeeting(meeting.meeting_key, apiKey);
      const matchingSessions = sessionType.toLowerCase() === 'all'
        ? sessions
        : sessions.filter(session => {
          const name = String(session.session_name || session.session_type || '').toLowerCase();
          return name === sessionType.toLowerCase();
        });
      const limitedSessions = sessionLimit ? matchingSessions.slice(0, sessionLimit) : matchingSessions;
      if (dryRun) {
        const sessionNames = limitedSessions.map(session => `${session.session_key}:${session.session_name}`);
        console.log(`[Dry Run] Meeting ${meeting.meeting_name} -> ${sessionNames.join(', ')}`);
        continue;
      }
      for (const session of limitedSessions) {
        const drivers = driverFilter.length ? driverFilter : await getDriversForSession(session.session_key, apiKey);
        await fetchTelemetryForSession({
          meeting,
          session,
          outputDir: path.join(outputDir, String(meeting.year)),
          endpoints: targetEndpoints,
          chunkMinutes,
          limitChunks: chunkLimit,
          drivers,
          resume,
          apiKey
        });
      }
    }
    return;
  }

  for (const year of years) {
    const meetings = await getMeetingsForYear(year, apiKey);
    const filteredMeetings = circuitFilter.length
      ? meetings.filter(meeting => circuitFilter.includes(meeting.circuit_short_name))
      : meetings;
    const yearMeetings = meetingLimit ? filteredMeetings.slice(0, meetingLimit) : filteredMeetings;

    for (const meeting of yearMeetings) {
      const sessions = await getSessionsForMeeting(meeting.meeting_key, apiKey);
      const matchingSessions = sessionType.toLowerCase() === 'all'
        ? sessions
        : sessions.filter(session => {
          const name = String(session.session_name || session.session_type || '').toLowerCase();
          return name === sessionType.toLowerCase();
        });
      const limitedSessions = sessionLimit ? matchingSessions.slice(0, sessionLimit) : matchingSessions;

      if (dryRun) {
        const sessionNames = limitedSessions.map(session => `${session.session_key}:${session.session_name}`);
        console.log(`[Dry Run] Year ${year} Meeting ${meeting.meeting_name} -> ${sessionNames.join(', ')}`);
        continue;
      }

      for (const session of limitedSessions) {
        const drivers = driverFilter.length ? driverFilter : await getDriversForSession(session.session_key, apiKey);
        await fetchTelemetryForSession({
          meeting,
          session,
          outputDir: path.join(outputDir, String(year)),
          endpoints: targetEndpoints,
          chunkMinutes,
          limitChunks: chunkLimit,
          drivers,
          resume,
          apiKey
        });
      }
    }
  }
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
