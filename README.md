# Filmore

One page, one input. Describe your taste, get 10 films you probably have not seen, with posters and directors.

## Run

```
cp .env.example .env   # add ANTHROPIC_API_KEY and TMDB_READ_TOKEN
node --env-file=.env server.js
```

Docker: `docker build -t filmore . && docker run -p 3000:3000 --env-file .env filmore`

Without keys it runs in demo mode with a fixed list. The background is a random film poster from TMDB (needs the TMDB token), softened with a cotton-candy wash; after a search it switches to your top pick. Without a token it shows a bundled cinema photo.

## How it works

Claude proposes 10 films. Each is checked against TMDB (title, year, director must match) before it is shown, so invented films are dropped. Posters come from TMDB.

## Next

Watched / rewatch / not for us statuses, director pages, per-person profiles, streaming availability.
