// Builds the portfolio from two inputs:
//   content/ — everything you edit (in the admin app or by hand): profile, page text, skills,
//              credentials and settings, plus one JSON file per job, project and school.
//   src/     — the design: index.html (the portfolio), resume.html (the résumé and the CV) and
//              404.html, with {{ placeholders }} for content (see scripts/lib/template.mjs).
// It writes index.html, resume/index.html, cv/index.html, 404.html and sitemap.xml, then prints
// the résumé and CV to resume.pdf and cv.pdf with headless Chrome (skipped, with a warning, when
// Chrome isn't installed — set CHROME_PATH to point at it).
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { cloudinary, compile, helpers, isVideo, videoFrame } from './scripts/lib/template.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);

// ---------------------------------------------------------------- content

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
async function readCollection(dir) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter(file => file.endsWith('.json')).sort();
  const items = await Promise.all(files.map(async file => ({ ...(await readJSON(`${dir}/${file}`)), _file: file.replace(/\.json$/, '') })));
  return items.filter(item => item.published !== false);
}
const slugify = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const plain = text => String(text || '').replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim();
const filled = list => (Array.isArray(list) ? list : []).filter(item => item && (typeof item !== 'string' || item.trim()));

const settings = await readJSON('content/settings.json');
const profile = await readJSON('content/profile.json');
const skills = await readJSON('content/skills.json');
const credentials = await readJSON('content/credentials.json');
const home = await readJSON('content/pages/home.json');
const resumePage = await readJSON('content/pages/resume.json');
const SITE_URL = String(settings.site_url || 'https://fluxion9.github.io').replace(/\/+$/, '');

// Dates are "YYYY" or "YYYY-MM".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = value => {
  const [year, month] = String(value || '').split('-');
  return !year ? '' : month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
};
const dateRange = (start, end, current) => {
  const from = formatDate(start);
  const to = current ? 'Present' : formatDate(end);
  return from && to && from !== to ? `${from} – ${to}` : from || to;
};
const newestFirst = (a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)) || String(b.start || '').localeCompare(String(a.start || ''));

// Images: a path in this repository (images/…) or a full URL (e.g. Cloudinary).
const isUrl = value => /^https?:\/\//i.test(String(value || ''));
const assetPath = (value, transform = 'c_limit,w_1200') => !value ? '' : isUrl(value) ? cloudinary(value, transform) : '/' + String(value).replace(/^\/+/, '');
const absolute = value => !value ? '' : isUrl(value) ? value : `${SITE_URL}${assetPath(value)}`;

// Project galleries: photos and videos for the viewer, as JSON read by js/site.js. Paths are
// relative to the home page (the only page with galleries); "<" is escaped so it can't end the script.
const galleryOf = (project) => filled(project.gallery).filter(item => item.media).map(item => {
  const video = isVideo(item.media);
  const local = !isUrl(item.media);
  return {
    type: video ? 'video' : 'image',
    src: local ? assetPath(item.media).slice(1) : video ? cloudinary(item.media, 'c_limit,h_1080') : cloudinary(item.media, 'c_limit,w_1800,h_1800'),
    poster: video && !local ? videoFrame(item.media, 'so_1,c_limit,h_1080') : '',
    thumb: video ? (local ? '' : videoFrame(item.media, 'so_1,c_fill,ar_16:10,w_960')) : assetPath(item.media, 'c_fill,g_auto,ar_16:10,w_960'),
    caption: item.caption || '',
    alt: item.alt || item.caption || project.name
  };
});
// Project files: "…/schematic.pdf" → { url, label, kind: 'PDF' }.
const filesOf = (project) => filled(project.files).filter(item => item.file).map(item => {
  const url = isUrl(item.file) ? item.file : assetPath(item.file);
  const ext = (String(item.file).split(/[?#]/)[0].match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toUpperCase();
  return { url, label: item.label || decodeURIComponent(String(item.file).split(/[?#]/)[0].split('/').pop()), kind: ext };
});

const CATEGORIES = { hardware: 'Hardware & PCB', embedded: 'Embedded & IoT', web: 'Web', backend: 'Backend & APIs', mobile: 'Mobile & PWA', ml: 'AI / ML' };
const SOCIAL_LABELS = { github: 'GitHub', linkedin: 'LinkedIn', x: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', blog: 'Blog', web: 'Website' };
// Short form for the résumé's contact line: "github.com/fluxion9".
const shortUrl = url => String(url || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');

const experience = (await readCollection('content/experience')).sort(newestFirst).map(job => ({
  ...job,
  dates: dateRange(job.start, job.end, job.current),
  highlights: filled(job.highlights),
  skills: filled(job.skills),
  meta: [job.employment_type, job.location].filter(Boolean).join(' · ')
}));

const education = (await readCollection('content/education')).sort(newestFirst).map(school => ({
  ...school,
  dates: dateRange(school.start, school.end, false),
  highlights: filled(school.highlights)
}));

const projects = (await readCollection('content/projects'))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)))
  .map(project => {
    const categories = filled(project.categories).filter(key => CATEGORIES[key]);
    const links = filled(project.links).filter(link => link.url);
    const isLogo = project.image_style === 'logo';
    const gallery = galleryOf(project);
    // Card image: the chosen image, else the first photo or video frame in the gallery.
    const cardImage = project.image
      ? assetPath(project.image, isLogo ? 'c_limit,w_900' : 'c_fill,g_auto,ar_16:10,w_960')
      : gallery.find(item => item.thumb)?.thumb || '';
    return {
      ...project,
      slug: slugify(project.name || project._file),
      categories,
      categoryKeys: categories.join(' '),
      categoryLabel: categories.map(key => CATEGORIES[key]).join(' · '),
      isLogo: isLogo && Boolean(project.image),
      imageSrc: cardImage,
      imageAlt: project.image_alt || gallery[0]?.alt || project.name,
      gallery,
      galleryCount: gallery.length,
      galleryLabel: `${gallery.length} ${gallery.some(item => item.type === 'video') ? (gallery.length === 1 ? 'video' : 'photos & videos') : (gallery.length === 1 ? 'photo' : 'photos')}`,
      galleryJson: JSON.stringify(gallery.map(({ thumb, ...item }) => item)).replace(/</g, '\\u003c'),
      files: filesOf(project),
      tags: filled(project.tags),
      highlights: filled(project.highlights),
      description: project.description || project.summary,
      links,
      linkShort: links[0] ? shortUrl(links[0].url) : ''
    };
  });

const socials = filled(profile.socials).filter(item => item.url).map(item => ({
  ...item,
  network: SOCIAL_LABELS[item.network] ? item.network : 'web',
  label: item.label || SOCIAL_LABELS[item.network] || 'Website',
  short: shortUrl(item.url)
}));

const skillGroups = filled(skills.groups).map(group => ({ ...group, skills: filled(group.skills) })).filter(group => group.skills.length);
const certifications = filled(credentials.certifications);
const awards = filled(credentials.awards);
const languages = filled(credentials.languages);
const interests = filled(credentials.interests);

// Hero numbers, worked out from the content.
const firstYear = Math.min(...experience.map(job => Number(String(job.start).slice(0, 4))).filter(Boolean));
const years = Number.isFinite(firstYear) ? new Date().getFullYear() - firstYear : 0;
const companies = new Set(experience.map(job => job.company.trim().toLowerCase())).size;
const stats = [
  years > 0 && { value: `${years}+`, label: years === 1 ? 'year of experience' : 'years of experience' },
  projects.length && { value: String(projects.length), label: projects.length === 1 ? 'project shipped' : 'projects shipped' },
  companies && { value: String(companies), label: companies === 1 ? 'company' : 'companies' }
].filter(Boolean);

const fileName = String(resumePage.file_name || slugify(profile.name) || 'resume').replace(/[^A-Za-z0-9-]/g, '');
const downloads = {
  resume: { href: '/resume.pdf', file: `${fileName}-Resume.pdf`, page: '/resume/' },
  cv: { href: '/cv.pdf', file: `${fileName}-CV.pdf`, page: '/cv/' }
};

const currentJob = experience.find(job => job.current);
// Structured data for search engines (schema.org Person); "<" escaped so it can't end the script.
const personJson = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Person', name: profile.name, jobTitle: profile.headline, url: SITE_URL,
  ...(profile.photo ? { image: absolute(profile.photo) } : {}),
  ...(profile.location ? { address: profile.location } : {}),
  ...(currentJob ? { worksFor: { '@type': 'Organization', name: currentJob.company } } : {}),
  alumniOf: education.map(school => ({ '@type': 'EducationalOrganization', name: school.school })),
  sameAs: socials.map(item => item.url)
}).replace(/</g, '\\u003c');
const contactReasons = filled(home.contact?.reasons);
const globals = {
  site: { ...settings, url: SITE_URL },
  profile: {
    ...profile,
    roles: filled(profile.roles),
    firstName: String(profile.name || '').split(' ')[0],
    initials: String(profile.name || '').split(/\s+/).filter(Boolean).map(word => word[0]).filter(letter => /[A-Z]/i.test(letter)).slice(0, 3).join('').toUpperCase(),
    photoSrc: assetPath(profile.photo, 'c_fill,g_face,w_640,h_640'),
    phoneLink: profile.phone ? `tel:${String(profile.phone).replace(/[^\d+]/g, '')}` : '',
    whatsappLink: profile.whatsapp ? `https://wa.me/${String(profile.whatsapp).replace(/\D/g, '')}` : '',
    currentRole: currentJob ? `${currentJob.role} at ${currentJob.company}` : ''
  },
  socials,
  home,
  stats: home.hero?.show_stats === false ? [] : stats,
  experience,
  education,
  projects,
  projectFilters: Object.entries(CATEGORIES).filter(([key]) => projects.some(project => project.categories.includes(key))).map(([key, label]) => ({ key, label })),
  skillGroups,
  certifications,
  awards,
  languages,
  interests,
  hasCredentials: Boolean(certifications.length || awards.length || languages.length),
  contactReasons,
  downloads,
  personJson,
  aboutParagraphs: filled(home.about?.paragraphs),
  focus: filled(home.about?.focus)
};

// ---------------------------------------------------------------- template helpers

// A file in the repository or a full URL, ready for src/href ("/images/x.png" is made relative per page).
helpers.asset = ([value, transform]) => assetPath(value, transform);
// Root-relative URL of a cache-busted file: {{ v "css/site.css" }} → /css/site.css?v=1a2b3c4d
const versions = {};
for (const file of ['css/site.css', 'css/resume.css', 'js/site.js']) {
  versions[file] = existsSync(file) ? createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 8) : '0';
}
helpers.v = ([file]) => `/${file}?v=${versions[file] ?? '0'}`;

// ---------------------------------------------------------------- pages

// Editor notes in <!-- --> comments stay in the source but are left out of published pages.
const stripComments = html => html.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, '');
// Root paths as paths relative to each page ("/css/" → "../css/" from /resume/), so pages work on
// any host, in a sub-folder, and straight from the disk (which is how the PDFs are printed). The
// 404 page is served at any address, so it keeps root paths.
const relativise = (html, file) => {
  if (file === '404.html') return html;
  const depth = file.split('/').length - 1;
  const up = depth ? '../'.repeat(depth) : './';
  return html.replace(/(\s(?:href|src|action|poster)=")\/(?!\/)/g, `$1${up}`);
};
// Cloudinary: automatic format and quality, unless a URL already sets them.
const TRANSFORM = '(?:a|ac|af|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_[^,/\\s"\'<>]+';
const CLOUDINARY = new RegExp(`(https://res\\.cloudinary\\.com/[^/\\s"'<>]+/(?:image|video)/upload/)((?:${TRANSFORM}(?:,${TRANSFORM})*/)*)`, 'g');
const optimiseCloudinary = html => html.replace(CLOUDINARY, (_, base, transforms) =>
  /(?:^|[,/])[fq]_/.test(transforms) ? base + transforms : `${base}${transforms}f_auto,q_auto/`);

const socialImage = absolute(home.seo?.image || profile.photo);
const seoTitle = plain(home.seo?.title) || `${profile.name} — ${profile.headline}`;
const description = plain(home.seo?.description) || plain(profile.tagline);
const resumeVariant = variant => {
  const isCv = variant === 'cv';
  const limits = resumePage.resume || {};
  const maxHighlights = Number(limits.max_highlights) || 99;
  const take = list => (isCv ? list : list.filter(item => item.on_resume !== false));
  return {
    variant,
    isCv,
    siteShort: shortUrl(SITE_URL),
    // A résumé lists professional profiles only; the CV lists them all.
    socials: isCv ? socials : socials.filter(item => ['linkedin', 'github', 'web', 'blog'].includes(item.network)),
    title: isCv ? 'Curriculum Vitae' : 'Résumé',
    showPhoto: Boolean(profile.photo && (isCv ? resumePage.cv?.show_photo !== false : resumePage.resume?.show_photo)),
    summary: resumePage.summary || '',
    jobs: take(experience).map(job => ({ ...job, highlights: isCv ? job.highlights : job.highlights.slice(0, maxHighlights) })),
    projects: isCv ? projects : take(projects).slice(0, Number(limits.max_projects) || 4),
    schools: take(education),
    certifications: take(certifications),
    awards: take(awards),
    languages,
    interests: isCv ? interests : [],
    download: downloads[variant],
    other: downloads[isCv ? 'resume' : 'cv'],
    otherTitle: isCv ? 'Résumé' : 'CV'
  };
};

const pages = [
  { source: 'src/index.html', file: 'index.html', path: '/', data: { seo: { title: seoTitle, description } } },
  { source: 'src/resume.html', file: 'resume/index.html', path: '/resume/', data: { doc: resumeVariant('resume'), seo: { title: `${profile.name} — Résumé`, description } } },
  { source: 'src/resume.html', file: 'cv/index.html', path: '/cv/', data: { doc: resumeVariant('cv'), seo: { title: `${profile.name} — Curriculum Vitae`, description } } },
  { source: 'src/404.html', file: '404.html', path: null, data: { seo: { title: `Page not found — ${profile.name}`, description: 'The page you requested could not be found.' } } }
];

const templates = {};
for (const page of pages) {
  templates[page.source] ||= compile(stripComments(await readFile(page.source, 'utf8')));
  let html = templates[page.source]({
    ...globals,
    ...page.data,
    route: { path: page.path || '' },
    canonical: page.path ? `${SITE_URL}${page.path}` : '',
    socialImage
  });
  html = relativise(optimiseCloudinary(html), page.file);
  await mkdir(path.dirname(page.file), { recursive: true });
  await writeFile(page.file, html);
}

await writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.filter(page => page.path).map(page => `  <url><loc>${SITE_URL}${page.path}</loc></url>`).join('\n')}
</urlset>
`);
await writeFile('robots.txt', `User-agent: *
Disallow: /admin-app/
Disallow: /content/
Disallow: /scripts/
Disallow: /src/

Sitemap: ${SITE_URL}/sitemap.xml
`);
console.log(`Built ${pages.length} pages (${experience.length} jobs, ${projects.length} projects, ${education.length} schools).`);

// ---------------------------------------------------------------- PDFs

const run = promisify(execFile);
async function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    try { return (await run('which', [name])).stdout.trim(); } catch { /* try the next one */ }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(mac) ? mac : '';
}

// Chrome stamps the time into each PDF; a fixed stamp keeps unchanged PDFs byte-identical, so a
// rebuild without content changes doesn't create a new commit.
const steadyPdf = buffer => {
  const text = buffer.toString('latin1').replace(/\/(CreationDate|ModDate) ?\(D:[^)]*\)/g, (match, key) => {
    const value = match.slice(match.indexOf('(') + 1, -1);
    return match.replace(value, 'D:20000101000000Z'.padEnd(value.length, ' ').slice(0, value.length));
  });
  return Buffer.from(text, 'latin1');
};

const chrome = await findChrome();
if (!chrome && process.env.CI) {
  throw new Error('Chrome is needed to print resume.pdf and cv.pdf. Install it or set CHROME_PATH.');
} else if (!chrome) {
  console.warn('Chrome not found, so resume.pdf and cv.pdf were not updated. Install Google Chrome or set CHROME_PATH.');
} else {
  const print = async (variant, out, fit) => {
    await run(chrome, [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
      '--no-pdf-header-footer', '--print-to-pdf-no-header', '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=15000', `--print-to-pdf=${out}`,
      pathToFileURL(path.join(ROOT, variant, 'index.html')).href + `?pdf=1${fit ? `&fit=${fit}` : ''}`
    ], { timeout: 120_000 });
    return readFile(out);
  };
  const pageCount = pdf => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  for (const variant of ['resume', 'cv']) {
    const out = path.join(ROOT, `${variant}.pdf`);
    const tmp = `${out}.tmp`;
    let pdf = await print(variant, tmp, 0);
    // The résumé should be one page: if it runs over, print again with tighter spacing.
    for (let fit = 1; variant === 'resume' && fit <= 3 && pageCount(pdf) > 1; fit++) pdf = await print(variant, tmp, fit);
    if (variant === 'resume' && pageCount(pdf) > 1) console.warn(`The résumé is ${pageCount(pdf)} pages. To fit one page, lower the bullets per job or the number of projects (Admin → Résumé & CV).`);
    await writeFile(out, steadyPdf(pdf));
    await rm(tmp, { force: true });
  }
  console.log(`Printed resume.pdf and cv.pdf (résumé: ${pageCount(await readFile('resume.pdf'))} page${pageCount(await readFile('resume.pdf')) === 1 ? '' : 's'}).`);
}

