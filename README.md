# Data Cleaner Web

Web front-end for the [data-cleaner](https://github.com/niwamanyadouglas/data-cleaner)
Python CLI tool. Built with Next.js 16, TypeScript, Tailwind CSS, and shadcn/ui.

Users can drag-and-drop or paste messy CSV / TSV / Excel / JSON data and get
back clean tabular data plus a full report of what changed (renamed columns,
replaced placeholders, parsed dates, removed duplicates, numeric conversions).

## What's inside

```
.
├── .github/workflows/ci.yml     # Lint + build on every push
├── src/
│   ├── app/
│   │   ├── api/clean/route.ts    # POST endpoint: parses input, runs cleaner, returns JSON
│   │   ├── globals.css           # Tailwind theme
│   │   ├── layout.tsx            # Root layout + metadata
│   │   └── page.tsx              # Main UI (drag/drop, paste, options, results, downloads)
│   ├── components/ui/            # shadcn/ui component library
│   ├── hooks/                    # use-toast, use-mobile
│   └── lib/
│       ├── cleaner.ts            # TypeScript port of cleaner/cleaning.py + report.py
│       ├── db.ts                 # Prisma client (not used here, kept for parity)
│       └── utils.ts              # cn() helper
├── public/                       # Static assets
├── prisma/                       # Prisma schema (not used here, kept for parity)
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json               # shadcn/ui config
└── eslint.config.mjs
```

The cleaning logic lives in `src/lib/cleaner.ts` — a TypeScript port of your
`cleaner/cleaning.py` and `cleaner/report.py`. Behaviour matches the Python
version: same column rename rules, same date parsing (ISO first, then
day/month-first), same leading-zero protection for zip-code-like identifiers,
same placeholder defaults.

## Run locally

```bash
npm install        # or: bun install / pnpm install
npm run dev        # starts Next.js on http://localhost:3000
```

Open <http://localhost:3000> in your browser.

## Deploy

This is a standard Next.js 16 app — it deploys to any platform that supports
Next.js. The two easiest options:

### Option A: Vercel (recommended, free tier)

1. Push this project to a new GitHub repository
   (e.g. `data-cleaner-web`, separate from your Python `data-cleaner` repo).
2. Go to <https://vercel.com> and sign in with GitHub.
3. Click **Add New Project**, import your `data-cleaner-web` repo.
4. Vercel auto-detects Next.js — leave the defaults:
   - **Framework preset**: Next.js
   - **Build command**: `next build`
   - **Output directory**: `.next`
   - **Install command**: `npm install`
5. Click **Deploy**. You'll get a `https://data-cleaner-web.vercel.app` URL
   (or whatever you name it) within ~2 minutes.
6. Every `git push` to `main` from then on auto-deploys.

### Option B: Netlify

1. Push to GitHub (same as above).
2. Go to <https://app.netlify.com> → **Add new site** → **Import an existing project**.
3. Pick your repo. Netlify will suggest Next.js settings — keep them.
4. Click **Deploy**.

### Option C: Self-host (Docker)

```bash
npm install
npm run build       # produces .next/standalone/ + .next/static/
node .next/standalone/server.js   # serve on port 3000
```

Put it behind nginx/Caddy and you're done. The `output: "standalone"` flag is
commented out in `next.config.ts` for Vercel compatibility — uncomment it if
you're going the Docker route.

## After deploy

Once your site is live, add a link to it from your Python repo's `README.md`:

```markdown
> **Try it online**: <https://your-deployed-url.vercel.app>
```

The Python CLI tool stays where it is for power users; the website is for
people who just want to drag-and-drop a file and get a clean result.

## License

MIT — see [LICENSE](LICENSE). Same license as the Python `data-cleaner` repo.

## Author

[Niwamanya Douglas](https://github.com/niwamanyadouglas)
