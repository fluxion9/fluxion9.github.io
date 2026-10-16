// A tiny, dependency-free template engine for src/index.html.
//
//   {{ path.to.value }}            value, HTML-escaped
//   {{{ path }}}                   value, unescaped (only for trusted markup)
//   {{ helper arg "literal" 80 }}  call a helper (see `helpers` below)
//   {{#each list}} … {{/each}}     loop; inside: {{ . }}, {{ @index }} (0-based), {{ @n }} (1-based),
//                                  {{ @num }} ("01"), @first, @last, @odd, @even
//   {{#if value}} … {{else}} … {{/if}}   (also {{#unless}}); `value` may be a helper call
//
// Names are looked up from the innermost loop item outwards to the root data, so inside a loop
// both the item's fields and top-level data (site, settings, …) are available.

export class Safe {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escape = value => value instanceof Safe ? value.value : String(value ?? '').replace(/[&<>"]/g, c => ESCAPES[c]);

// ---------------------------------------------------------------- parsing

const TAG = /\{\{\{\s*([\s\S]+?)\s*\}\}\}|\{\{\s*([#/]?)\s*([\s\S]+?)\s*\}\}/g;

export function compile(source) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const target = () => { const node = stack[stack.length - 1]; return node.inElse ? node.elseChildren : node.children; };
  let last = 0;
  let match;
  TAG.lastIndex = 0;
  while ((match = TAG.exec(source))) {
    let [whole, raw, prefix, body] = match;
    let start = match.index;
    let end = start + whole.length;
    const isBlock = prefix === '#' || prefix === '/' || body === 'else';
    if (isBlock && raw === undefined) {
      // A block tag alone on its line removes the whole line, so templates can be indented freely.
      const lineStart = source.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = source.indexOf('\n', end);
      const before = source.slice(lineStart, start);
      const after = source.slice(end, lineEnd === -1 ? source.length : lineEnd);
      if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after) && lineStart >= last) {
        start = lineStart;
        end = lineEnd === -1 ? source.length : lineEnd + 1;
      }
    }
    if (start > last) target().push({ type: 'text', value: source.slice(last, start) });
    last = end;
    TAG.lastIndex = end;

    if (raw !== undefined) { target().push({ type: 'raw', expr: raw }); continue; }
    if (prefix === '#') {
      const [, kind, expr] = body.match(/^(each|if|unless)\s+([\s\S]+)$/) || [];
      if (!kind) throw new Error(`Unknown block {{#${body}}}`);
      const node = { type: kind, expr, children: [], elseChildren: [], inElse: false };
      target().push(node);
      stack.push(node);
    } else if (prefix === '/') {
      const node = stack.pop();
      if (!node || node.type !== body.trim()) throw new Error(`Unexpected {{/${body}}}${node ? ` (open block: ${node.type})` : ''}`);
    } else if (body === 'else') {
      const node = stack[stack.length - 1];
      if (!['if', 'unless'].includes(node.type)) throw new Error('{{else}} outside {{#if}}');
      node.inElse = true;
    } else {
      target().push({ type: 'var', expr: body });
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed {{#${stack[stack.length - 1].type}}}`);
  if (last < source.length) target().push({ type: 'text', value: source.slice(last) });
  return data => renderNodes(root.children, [{ data, meta: {} }]);
}

// ---------------------------------------------------------------- evaluation

function lookup(path, frames) {
  if (path === '.' || path === 'this') return frames[frames.length - 1].data;
  if (path.startsWith('@')) return frames[frames.length - 1].meta[path.slice(1)];
  const [first, ...rest] = path.split('.');
  let value;
  for (let i = frames.length - 1; i >= 0; i--) {
    const data = frames[i].data;
    if (data !== null && typeof data === 'object' && first in data) { value = data[first]; break; }
  }
  for (const key of rest) value = value == null ? undefined : value[key];
  return value;
}

function evaluate(expr, frames) {
  const tokens = expr.match(/"[^"]*"|'[^']*'|\S+/g);
  const [name, ...args] = tokens;
  if (helpers[name] && (args.length || ZERO_ARG.has(name))) {
    const values = args.map(arg => /^["']/.test(arg) ? arg.slice(1, -1) : /^-?\d+(\.\d+)?$/.test(arg) ? Number(arg) : lookup(arg, frames));
    return helpers[name](values, frames);
  }
  if (tokens.length > 1) throw new Error(`Unknown helper "${name}" in {{ ${expr} }}`);
  return lookup(name, frames);
}

const truthy = value => Array.isArray(value) ? value.length > 0 : Boolean(value);

function renderNodes(nodes, frames) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.value;
    else if (node.type === 'var') out += escape(evaluate(node.expr, frames));
    else if (node.type === 'raw') out += String(evaluate(node.expr, frames) ?? '');
    else if (node.type === 'if' || node.type === 'unless') {
      const pass = truthy(evaluate(node.expr, frames)) === (node.type === 'if');
      out += renderNodes(pass ? node.children : node.elseChildren, frames);
    } else if (node.type === 'each') {
      const list = evaluate(node.expr, frames) || [];
      list.forEach((item, index) => {
        const n = index + 1;
        const meta = { index, n, num: String(n).padStart(2, '0'), first: index === 0, last: index === list.length - 1, odd: n % 2 === 1, even: n % 2 === 0 };
        out += renderNodes(node.children, [...frames, { data: item, meta }]);
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- helpers

// Cloudinary: insert a transformation after /upload/ unless the URL already has one
// (an editor's own crop wins). Non-Cloudinary URLs are returned unchanged.
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload\/)(.*)$/;
export function cloudinary(url, transform) {
  const match = String(url || '').match(CLOUDINARY_UPLOAD);
  if (!match || !transform) return url || '';
  const [, base, rest] = match;
  if (/^[a-z]{1,3}_[^/]*\//.test(rest)) return url;
  return `${base}${transform}/${rest}`;
}
export const isVideo = url => /\/video\/upload\//.test(String(url || '')) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(url || ''));
// A still frame of a Cloudinary video, delivered as an image (e.g. for thumbnails and posters).
export const videoFrame = (url, transform) => cloudinary(url, transform).replace(/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i, '.jpg');

const ZERO_ARG = new Set(['currentYear']);

export const helpers = {
  // Editor text → HTML: *word* is highlighted (cyan), a new line becomes a line break.
  md: ([text]) => new Safe(escape(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\r?\n/g, '<br>')),
  // Longer editor text → paragraphs (blank line = new paragraph); email addresses and web
  // addresses become links.
  paras: ([text]) => new Safe(String(text || '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map(block =>
    '<p>' + escape(block)
      .replace(/\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/g, '<a href="mailto:$1">$1</a>')
      .replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
      .replace(/\r?\n/g, '<br>') + '</p>').join('\n')),
  icon: ([name]) => new Safe(`<svg class="i" aria-hidden="true"><use href="#i-${escape(name)}"/></svg>`),
  cld: ([url, transform]) => cloudinary(url, transform),
  frame: ([url, transform]) => videoFrame(url, transform),
  video: ([url]) => isVideo(url),
  // Staggered reveal: index within a row of `cols`, times `step` milliseconds.
  delay: ([step, cols], frames) => {
    const index = frames[frames.length - 1].meta.index || 0;
    const value = (cols ? index % cols : index) * step;
    return new Safe(value ? ` data-delay="${value}"` : '');
  },
  join: ([list, separator]) => (list || []).filter(Boolean).join(separator ?? ', '),
  tel: ([phone]) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`,
  wa: ([number, message]) => `https://wa.me/${String(number || '').replace(/\D/g, '')}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
  eq: ([a, b]) => a === b,
  currentYear: () => new Date().getFullYear(),
};
