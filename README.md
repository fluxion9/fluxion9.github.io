# fluxion9.github.io

Isaac J. Newton's portfolio — <https://fluxion9.github.io>. A fast, dependency-free static site
with a downloadable **résumé** (one page) and **CV** (everything) as PDFs, edited through a
separate admin app (`admin-app/`, hosted on Render) that also shows visitor analytics.

```
Save in the admin ──► content/*.json committed to GitHub
                  ──► "Build and deploy site" GitHub Action runs node build.mjs
                      (pages + resume.pdf + cv.pdf, printed by headless Chrome)
                  ──► generated files committed and published to GitHub Pages
```

## Pages

| Address | What |
| --- | --- |
| `/` | The portfolio: about, experience, projects (with filters), skills, education, contact form |
| `/resume/`, `/resume.pdf` | One-page résumé: items marked **Include on résumé**, with limits set in the admin |
| `/cv/`, `/cv.pdf` | Full CV: every published job, project, school and credential |

Every "Download résumé" button downloads the PDF; the online versions have Print and Download buttons.

## Editing content

Use the admin app (see [admin-app/README.md](admin-app/README.md) to deploy it), or edit the JSON in
`content/` directly and push:

- `content/profile.json`, `skills.json`, `credentials.json`, `settings.json`
- `content/pages/home.json` (section text) and `content/pages/resume.json` (résumé & CV options)
- `content/experience/`, `content/projects/`, `content/education/` — one file per item

In headings, wrap words in `*asterisks*` to show them in the accent colour. Images can be a path in
this repository (`images/…`) or a Cloudinary URL (resized and optimised automatically).

## One-time setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Actions → General → Workflow permissions → Read and write permissions**, so the
   workflow can commit the generated pages.
3. Deploy the admin on Render: [admin-app/README.md](admin-app/README.md).

## How it's built

- `src/index.html`, `src/resume.html`, `src/404.html` — the design, with `{{ placeholders }}`
  (engine: `scripts/lib/template.mjs`).
- `css/site.css`, `css/resume.css`, `js/site.js` — styles and the (dependency-free) script:
  theme switch, menu, project filters, contact form and anonymous analytics.
- `build.mjs` — reads `content/`, writes `index.html`, `resume/`, `cv/`, `404.html`, `sitemap.xml`
  and `robots.txt`, then prints `resume.pdf` and `cv.pdf` with headless Chrome (PDFs are byte-identical
  when nothing changed, so rebuilds don't create empty commits).

Generated files are overwritten on every build — change `content/` or `src/` instead.

```bash
node build.mjs                      # needs Chrome for the PDFs (or set CHROME_PATH=/path/to/chrome)
python3 -m http.server 8000         # preview at http://localhost:8000
```

## Contact form

Messages go to the Formspree form set in **Site settings → Contact form endpoint**. With no endpoint,
the form opens the visitor's email app addressed to the email in your profile.
