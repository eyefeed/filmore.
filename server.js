import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const { ANTHROPIC_API_KEY, TMDB_READ_TOKEN } = process.env;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const DEMO = [
  ["Burning", 2018, "Lee Chang-dong", "Slow, ambiguous Korean mystery that rewards patience."],
  ["Once Upon a Time in Anatolia", 2011, "Nuri Bilge Ceylan", "A night search that turns into a study of guilt."],
  ["Memories of Murder", 2003, "Bong Joon-ho", "Dark comedy and dread in one Korean crime classic."],
  ["The Lobster", 2015, "Yorgos Lanthimos", "Deadpan absurdity with a cruel streak."],
  ["Uzak", 2002, "Nuri Bilge Ceylan", "Quiet, funny, lonely Turkish drama."],
  ["In Bruges", 2008, "Martin McDonagh", "Violent English dark comedy with real heart."],
  ["Oldboy", 2003, "Park Chan-wook", "Revenge told with operatic brutality."],
  ["Dogtooth", 2009, "Yorgos Lanthimos", "Disturbing family satire."],
  ["Poetry", 2010, "Lee Chang-dong", "Gentle on the surface, devastating underneath."],
  ["The Death of Stalin", 2017, "Armando Iannucci", "Sharp British political farce."],
].map(([title, year, director, why]) => ({ title, year, director, why }));

async function askClaude(query) {
  const system =
    "You are a film curator for a household with unconventional taste who dislikes mainstream picks. " +
    "Directors matter most. Return exactly 10 real feature films as a JSON array and nothing else. " +
    'Each item: {"title": original or best-known title, "year": number, "director": string, "why": one sentence tying it to the request}. ' +
    "Only include films you are certain exist. Prefer lesser-known picks and mix countries when the request allows.";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: query }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const text = data.content.map((b) => b.text || "").join("");
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  return JSON.parse(json);
}

const tmdb = (path) =>
  fetch(`https://api.themoviedb.org/3${path}`, { headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` } }).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`TMDB ${r.status}`)),
  );

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Confirm the film exists and the director matches; drop anything TMDB cannot back up.
async function verify(f) {
  const q = encodeURIComponent(f.title);
  const { results } = await tmdb(`/search/movie?query=${q}&year=${f.year}`);
  const wanted = norm(f.director);
  for (const hit of results.slice(0, 3)) {
    const d = await tmdb(`/movie/${hit.id}?append_to_response=credits`);
    const directors = d.credits.crew.filter((c) => c.job === "Director").map((c) => c.name);
    if (!directors.some((n) => norm(n) === wanted)) continue;
    return {
      ...f,
      title: d.title,
      director: directors.join(", "),
      year: (d.release_date || "").slice(0, 4) || f.year,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      tmdb: `https://www.themoviedb.org/movie/${d.id}`,
      countries: (d.production_countries || []).map((c) => c.name),
      runtime: d.runtime,
    };
  }
  return null;
}

async function recommend(query) {
  if (!ANTHROPIC_API_KEY) return { demo: true, films: DEMO };
  const picks = await askClaude(query);
  if (!TMDB_READ_TOKEN) return { demo: false, unverified: true, films: picks };
  const checked = await Promise.all(picks.map((p) => verify(p).catch(() => null)));
  return { demo: false, films: checked.filter(Boolean) };
}

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/recommend") {
      let body = "";
      for await (const c of req) body += c;
      const { query } = JSON.parse(body || "{}");
      if (!query || query.length > 2000) {
        res.writeHead(400).end(JSON.stringify({ error: "Describe what you want to watch." }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(await recommend(query)));
      return;
    }
    const path = req.url.split("?")[0];
    const file = join(ROOT, normalize(path === "/" ? "/index.html" : path));
    if (!file.startsWith(ROOT)) throw new Error("bad path");
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(buf);
  } catch (e) {
    const notFound = e.code === "ENOENT" || e.message === "bad path";
    res.writeHead(notFound ? 404 : 500, { "content-type": "application/json" }).end(JSON.stringify({ error: notFound ? "Not found" : "Something went wrong" }));
    if (!notFound) console.error(e);
  }
}).listen(PORT, () => console.log(`Filmore on http://localhost:${PORT}${ANTHROPIC_API_KEY ? "" : " (demo mode)"}`));
