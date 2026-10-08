import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const { ANTHROPIC_API_KEY, TMDB_READ_TOKEN } = process.env;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

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
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      tmdb: `https://www.themoviedb.org/movie/${d.id}`,
      countries: (d.production_countries || []).map((c) => c.name),
      runtime: d.runtime,
    };
  }
  return null;
}

// Background: a random poster from a list of IMDb top-100 films, resolved through TMDB and cached.
const TOP100 = [
  ["The Shawshank Redemption", 1994],
  ["The Godfather", 1972],
  ["The Dark Knight", 2008],
  ["The Godfather Part II", 1974],
  ["12 Angry Men", 1957],
  ["Schindler's List", 1993],
  ["The Lord of the Rings: The Return of the King", 2003],
  ["Pulp Fiction", 1994],
  ["The Good, the Bad and the Ugly", 1966],
  ["Fight Club", 1999],
  ["Forrest Gump", 1994],
  ["Inception", 2010],
  ["Star Wars: Episode V - The Empire Strikes Back", 1980],
  ["The Matrix", 1999],
  ["Goodfellas", 1990],
  ["One Flew Over the Cuckoo's Nest", 1975],
  ["Se7en", 1995],
  ["Seven Samurai", 1954],
  ["It's a Wonderful Life", 1946],
  ["The Silence of the Lambs", 1991],
  ["City of God", 2002],
  ["Saving Private Ryan", 1998],
  ["Life Is Beautiful", 1997],
  ["Interstellar", 2014],
  ["The Green Mile", 1999],
  ["Spirited Away", 2001],
  ["Parasite", 2019],
  ["L\u00e9on: The Professional", 1994],
  ["Gladiator", 2000],
  ["The Lion King", 1994],
  ["Back to the Future", 1985],
  ["The Pianist", 2002],
  ["Terminator 2: Judgment Day", 1991],
  ["Psycho", 1960],
  ["Modern Times", 1936],
  ["American History X", 1998],
  ["Whiplash", 2014],
  ["The Departed", 2006],
  ["The Prestige", 2006],
  ["Grave of the Fireflies", 1988],
  ["Once Upon a Time in the West", 1968],
  ["Casablanca", 1942],
  ["Cinema Paradiso", 1988],
  ["Rear Window", 1954],
  ["Alien", 1979],
  ["City Lights", 1931],
  ["Apocalypse Now", 1979],
  ["Memento", 2000],
  ["Django Unchained", 2012],
  ["Raiders of the Lost Ark", 1981],
  ["WALL\u00b7E", 2008],
  ["The Lives of Others", 2006],
  ["Sunset Blvd.", 1950],
  ["Paths of Glory", 1957],
  ["Oldboy", 2003],
  ["Witness for the Prosecution", 1957],
  ["The Shining", 1980],
  ["Dr. Strangelove", 1964],
  ["Spider-Man: Into the Spider-Verse", 2018],
  ["Aliens", 1986],
  ["American Beauty", 1999],
  ["The Dark Knight Rises", 2012],
  ["Amadeus", 1984],
  ["Inglourious Basterds", 2009],
  ["Toy Story", 1995],
  ["Coco", 2017],
  ["Good Will Hunting", 1997],
  ["Princess Mononoke", 1997],
  ["Requiem for a Dream", 2000],
  ["Star Wars", 1977],
  ["Reservoir Dogs", 1992],
  ["Your Name.", 2016],
  ["3 Idiots", 2009],
  ["Once Upon a Time in America", 1984],
  ["Braveheart", 1995],
  ["Das Boot", 1981],
  ["Come and See", 1985],
  ["Metropolis", 1927],
  ["Singin' in the Rain", 1952],
  ["Taxi Driver", 1976],
  ["2001: A Space Odyssey", 1968],
  ["Vertigo", 1954],
  ["Full Metal Jacket", 1987],
  ["Double Indemnity", 1944],
  ["Scarface", 1983],
  ["Citizen Kane", 1941],
  ["The Apartment", 1960],
  ["North by Northwest", 1959],
  ["Heat", 1995],
  ["A Clockwork Orange", 1971],
  ["Lawrence of Arabia", 1962],
  ["Snatch", 2000],
  ["Ikiru", 1952],
  ["Bicycle Thieves", 1948],
  ["The Kid", 1921],
  ["Hamilton", 2020],
  ["Some Like It Hot", 1959],
];
const posterCache = new Map();

async function scene() {
  const [title, year] = TOP100[Math.floor(Math.random() * TOP100.length)];
  if (!posterCache.has(title)) {
    const { results } = await tmdb(`/search/movie?query=${encodeURIComponent(title)}&year=${year}`);
    const hit = results.find((r) => r.poster_path);
    posterCache.set(title, hit ? { title, year, image: `https://image.tmdb.org/t/p/w780${hit.poster_path}` } : {});
  }
  return posterCache.get(title);
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
    if (req.url === "/api/scene") {
      const found = TMDB_READ_TOKEN ? await scene().catch(() => null) : null;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(found || {}));
      return;
    }
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
