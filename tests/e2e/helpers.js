// -----------------------------------------------------------------------------
// Pace Plot — Shared E2E Deterministic Test Harness (`tests/e2e/helpers.js`)
// Provides Node v24 module hooks (.css / ?raw), DOM/SVG/D3-compatible mocks,
// Storage, CacheStorage, Fetch (OSRM, Overpass, Open-Meteo, Nominatim, Photon,
// Spotify PKCE), Web Bluetooth, Geolocation, Google Maps, and Leaflet mocks.
// -----------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Register Node v24 module hooks so importing .css or ?raw in src/*.js succeeds
let hooksRegistered = false;
export function ensureModuleHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  try {
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier.endsWith('?raw')) {
          const cleanSpecifier = specifier.slice(0, -4);
          const resolved = nextResolve(cleanSpecifier, context);
          return {
            ...resolved,
            url: `${resolved.url}?raw`,
            shortCircuit: true
          };
        }
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url.endsWith('.css') || url.includes('.css?')) {
          return {
            format: 'module',
            shortCircuit: true,
            source: 'export default {};'
          };
        }
        if (url.endsWith('?raw')) {
          const fileUrl = new URL(url.slice(0, -4));
          const rawText = fs.readFileSync(fileUrl, 'utf8');
          return {
            format: 'module',
            shortCircuit: true,
            source: `export default ${JSON.stringify(rawText)};`
          };
        }
        if (
          url.startsWith('file://') &&
          !url.includes('/node_modules/') &&
          (url.endsWith('.json') || url.includes('.json?'))
        ) {
          const cleanUrl = url.split('?')[0];
          const jsonText = fs.readFileSync(new URL(cleanUrl), 'utf8');
          if (context?.importAttributes?.type === 'json') {
            return {
              format: 'json',
              shortCircuit: true,
              source: jsonText
            };
          }
          return {
            format: 'module',
            shortCircuit: true,
            source: `export default ${jsonText};`
          };
        }
        return nextLoad(url, context);
      }
    });
  } catch (_) {
    // Hooks already active
  }
}

ensureModuleHooks();

export function resolveProjectPath(relPath) {
  return path.resolve(PROJECT_ROOT, relPath);
}

export function projectFileExists(relPath) {
  return fs.existsSync(resolveProjectPath(relPath));
}

export function readProjectFile(relPath) {
  return fs.readFileSync(resolveProjectPath(relPath), 'utf8');
}

/**
 * Reads `index.html` and expands any HTML partial directives (`<!-- @include ... -->`)
 * from `src/templates/*.html`, or falls back to appending template files so all
 * DOM IDs and markup are assembled identically to Vite's `transformIndexHtml`.
 */
export function getAssembledIndexHtml() {
  let html = readProjectFile('index.html');

  // Expand <!-- @include path/to/template.html --> directives if present
  html = html.replace(/<!--\s*@include\s+([^\s]+)\s*-->/g, (_match, relTemplatePath) => {
    const cleanRel = relTemplatePath.replace(/^\//, '');
    const candidatePaths = [
      cleanRel,
      path.join('src/templates', path.basename(cleanRel))
    ];
    for (const candidate of candidatePaths) {
      if (projectFileExists(candidate)) {
        return readProjectFile(candidate);
      }
    }
    return '';
  });

  // Also check if src/templates/*.html exist and were included via another mechanism
  const templatesDir = resolveProjectPath('src/templates');
  if (fs.existsSync(templatesDir) && fs.statSync(templatesDir).isDirectory()) {
    const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.html')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      // If a landmark ID from this template isn't in html yet, append it
      const sampleIdMatch = content.match(/\bid="([^"]+)"/);
      if (sampleIdMatch && !html.includes(`id="${sampleIdMatch[1]}"`)) {
        html += `\n${content}`;
      }
    }
  }

  return html;
}

export function extractHtmlIds(htmlString = getAssembledIndexHtml()) {
  return new Set([...htmlString.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    },
    clear() {
      map.clear();
    },
    dump() {
      return Object.fromEntries(map.entries());
    }
  };
}

export function createMockCacheStorage() {
  const cachesMap = new Map();

  function normalizeKey(reqOrUrl) {
    if (!reqOrUrl) return '';
    const raw = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url || String(reqOrUrl);
    try {
      const u = new URL(raw, 'http://localhost:3000');
      return u.pathname + u.search;
    } catch (_) {
      return raw;
    }
  }

  function wrapResponse(res) {
    if (!res) return null;
    const bodyText = typeof res._bodyText === 'string'
      ? res._bodyText
      : typeof res === 'string'
        ? res
        : JSON.stringify(res);
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      statusText: res.statusText ?? 'OK',
      headers: res.headers || new Map(),
      _bodyText: bodyText,
      async text() {
        return bodyText;
      },
      async json() {
        return JSON.parse(bodyText);
      },
      clone() {
        return wrapResponse({ ...res, _bodyText: bodyText });
      }
    };
  }

  function getOrCreateCache(name) {
    if (!cachesMap.has(name)) {
      const entries = new Map();
      cachesMap.set(name, {
        name,
        entries,
        async addAll(urls) {
          for (const u of urls) {
            entries.set(normalizeKey(u), wrapResponse({ status: 200, _bodyText: '' }));
          }
        },
        async put(req, res) {
          let bodyText = '';
          if (res && typeof res.clone === 'function') {
            try {
              bodyText = await res.clone().text();
            } catch (_) {
              bodyText = await res.text();
            }
          } else if (res && typeof res.text === 'function') {
            bodyText = await res.text();
          } else if (typeof res === 'string') {
            bodyText = res;
          } else if (res !== undefined) {
            bodyText = JSON.stringify(res);
          }
          entries.set(normalizeKey(req), wrapResponse({ status: res?.status ?? 200, _bodyText: bodyText }));
        },
        async match(req) {
          const hit = entries.get(normalizeKey(req));
          return hit ? hit.clone() : undefined;
        },
        async delete(req) {
          return entries.delete(normalizeKey(req));
        },
        async keys() {
          return Array.from(entries.keys()).map((url) => ({ url }));
        }
      });
    }
    return cachesMap.get(name);
  }

  return {
    cachesMap,
    async open(name) {
      return getOrCreateCache(name);
    },
    async has(name) {
      return cachesMap.has(name);
    },
    async delete(name) {
      return cachesMap.delete(name);
    },
    async keys() {
      return Array.from(cachesMap.keys());
    },
    async match(req) {
      for (const cache of cachesMap.values()) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      return undefined;
    }
  };
}

// -----------------------------------------------------------------------------
// Lightweight DOM / SVG / D3-Compatible Mock Environment
// -----------------------------------------------------------------------------

function createStyleObject() {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'setProperty') {
        return (k, v) => {
          target[k] = String(v ?? '');
          const camel = String(k).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          target[camel] = String(v ?? '');
        };
      }
      if (prop === 'removeProperty') {
        return (k) => {
          delete target[k];
          const camel = String(k).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          delete target[camel];
        };
      }
      if (prop === 'getPropertyValue') {
        return (k) => target[k] ?? '';
      }
      return target[prop] ?? '';
    },
    set(target, prop, value) {
      target[prop] = String(value ?? '');
      const kebab = String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      target[kebab] = String(value ?? '');
      return true;
    }
  });
}

function createClassList(element) {
  const getSet = () => new Set(String(element._attributes.get('class') || '').split(/\s+/).filter(Boolean));
  const sync = (set) => {
    element._attributes.set('class', Array.from(set).join(' '));
  };
  return {
    add(...tokens) {
      const s = getSet();
      tokens.forEach((t) => {
        if (t) s.add(t);
      });
      sync(s);
    },
    remove(...tokens) {
      const s = getSet();
      tokens.forEach((t) => s.delete(t));
      sync(s);
    },
    toggle(token, force) {
      const s = getSet();
      const shouldHave = force !== undefined ? Boolean(force) : !s.has(token);
      if (shouldHave) s.add(token);
      else s.delete(token);
      sync(s);
      return shouldHave;
    },
    contains(token) {
      return getSet().has(token);
    },
    toString() {
      return Array.from(getSet()).join(' ');
    }
  };
}

function matchesSimpleSelector(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  const sel = selector.trim();
  if (!sel || sel === '*') return true;

  // Extract attribute selectors [attr="val"] or [attr]
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=['"]?([^'"\]]*)['"]?)?\]/g;
  let match;
  while ((match = attrRegex.exec(sel)) !== null) {
    const attrName = match[1];
    const expectedVal = match[2];
    const actualVal = el.getAttribute(attrName);
    if (expectedVal !== undefined) {
      if (actualVal !== expectedVal) return false;
    } else if (actualVal === null) {
      return false;
    }
  }

  const withoutAttrs = sel.replace(attrRegex, '');
  if (!withoutAttrs) return true;

  // Extract ID
  const idMatch = withoutAttrs.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch && el.id !== idMatch[1]) {
    return false;
  }

  // Extract classes
  const classMatches = [...withoutAttrs.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
  for (const cm of classMatches) {
    if (!el.classList.contains(cm[1])) return false;
  }

  // Extract tag name
  const tagPart = withoutAttrs
    .replace(/#[a-zA-Z0-9_-]+/g, '')
    .replace(/\.[a-zA-Z0-9_-]+/g, '')
    .trim();
  if (tagPart && tagPart !== '*') {
    if (el.tagName.toLowerCase() !== tagPart.toLowerCase()) return false;
  }

  return true;
}

function matchesSelectorChain(el, fullSelector) {
  const parts = fullSelector.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false;

  let current = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (current && !matchesSimpleSelector(current, parts[i])) {
      current = current.parentNode;
    }
    if (!current) return false;
    current = current.parentNode;
  }
  return true;
}

function matchesAnySelector(el, selectorGroup) {
  const groups = String(selectorGroup || '').split(',').map((s) => s.trim()).filter(Boolean);
  return groups.some((g) => matchesSelectorChain(el, g));
}

export class MockElement {
  constructor(tagName = 'div', ownerDocument = null, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    this.nodeType = 1;
    this.tagName = String(tagName || 'div').toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespaceURI;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._attributes = new Map();
    this._listeners = new Map();
    this.style = createStyleObject();
    this.classList = createClassList(this);
    this._textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.title = '';
    this.dataset = new Proxy(
      {},
      {
        get: (_t, prop) => {
          const kebab = `data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
          return this._attributes.get(kebab);
        },
        set: (_t, prop, val) => {
          const kebab = `data-${String(prop).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
          this.setAttribute(kebab, String(val));
          return true;
        }
      }
    );
  }

  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? this.parentNode.childNodes[idx - 1] || null : null;
  }

  get id() {
    return this._attributes.get('id') || '';
  }

  set id(val) {
    this.setAttribute('id', val);
  }

  get className() {
    return this._attributes.get('class') || '';
  }

  set className(val) {
    this.setAttribute('class', val);
  }

  get textContent() {
    if (this.childNodes.length > 0) {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    return this._textContent;
  }

  set textContent(val) {
    this.childNodes = [];
    this._textContent = String(val ?? '');
    this._innerHTML = this._textContent;
  }

  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.textContent;
  }

  set innerHTML(val) {
    this._innerHTML = String(val ?? '');
    this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    this.childNodes = [];
    if (this._innerHTML && this.ownerDocument) {
      this._parseImmediateChildren(this._innerHTML);
    }
  }

  _parseImmediateChildren(html) {
    // Parse lightweight inner elements (buttons, divs, spans, inputs, etc. with id/class/data-*)
    const tagRegex = /<([a-zA-Z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const childTag = match[1];
      const attrStr = match[2] || '';
      const inner = match[3] || '';
      const child = this.ownerDocument.createElement(childTag);
      const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        child.setAttribute(am[1], am[2]);
      }
      child._innerHTML = inner;
      child._textContent = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      this.appendChild(child);
    }
  }

  setAttribute(name, value) {
    const strVal = String(value ?? '');
    this._attributes.set(name, strVal);
    if (name === 'id' && this.ownerDocument) {
      this.ownerDocument._idMap.set(strVal, this);
    }
    if (name === 'value') {
      this.value = strVal;
    }
    if (name === 'title') {
      this.title = strVal;
    }
  }

  setAttributeNS(_ns, name, value) {
    this.setAttribute(name, value);
  }

  getAttribute(name) {
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this._attributes.has(name);
  }

  removeAttribute(name) {
    if (name === 'id' && this.ownerDocument) {
      const oldId = this._attributes.get('id');
      if (oldId && this.ownerDocument._idMap.get(oldId) === this) {
        this.ownerDocument._idMap.delete(oldId);
      }
    }
    this._attributes.delete(name);
  }

  removeAttributeNS(_ns, name) {
    this.removeAttribute(name);
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    this._registerSubtreeIds(child);
    return child;
  }

  insertBefore(newNode, referenceNode) {
    if (!newNode) return newNode;
    if (!referenceNode) return this.appendChild(newNode);
    if (newNode.parentNode) {
      newNode.parentNode.removeChild(newNode);
    }
    const idx = this.childNodes.indexOf(referenceNode);
    newNode.parentNode = this;
    if (idx === -1) {
      this.childNodes.push(newNode);
    } else {
      this.childNodes.splice(idx, 0, newNode);
    }
    this._registerSubtreeIds(newNode);
    return newNode;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  _registerSubtreeIds(node) {
    if (!this.ownerDocument || !node) return;
    if (node.id) {
      this.ownerDocument._idMap.set(node.id, node);
    }
    if (Array.isArray(node.childNodes)) {
      node.childNodes.forEach((c) => this._registerSubtreeIds(c));
    }
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (matchesAnySelector(child, selector)) {
            results.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (matchesAnySelector(curr, selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') return;
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).delete(listener);
    }
  }

  dispatchEvent(event) {
    const evt = typeof event === 'string' ? { type: event } : event;
    if (!evt.target) evt.target = this;
    if (!evt.currentTarget) evt.currentTarget = this;
    if (typeof evt.preventDefault !== 'function') evt.preventDefault = () => {};
    if (typeof evt.stopPropagation !== 'function') evt.stopPropagation = () => {};

    const set = this._listeners.get(evt.type);
    if (set) {
      for (const fn of [...set]) {
        fn.call(this, evt);
      }
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, currentTarget: this });
  }

  focus() {}
  blur() {}
  scrollIntoView() {}

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 356, bottom: 198, width: 356, height: 198, x: 0, y: 0 };
  }

  compareDocumentPosition(other) {
    if (other === this) return 0;
    if (this.parentNode && other && this.parentNode === other.parentNode) {
      const aIdx = this.parentNode.childNodes.indexOf(this);
      const bIdx = this.parentNode.childNodes.indexOf(other);
      if (aIdx !== -1 && bIdx !== -1) {
        return aIdx < bIdx ? 4 : 2;
      }
    }
    return 4;
  }
}

export class MockDocument {
  constructor() {
    this.nodeType = 9;
    this._idMap = new Map();
    this._listeners = new Map();
    this.documentElement = new MockElement('html', this);
    this.documentElement.classList.add('dark');
    this.head = new MockElement('head', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName) {
    const tag = String(tagName || 'div').toLowerCase();
    const ns = ['svg', 'path', 'circle', 'rect', 'line', 'g', 'text', 'defs', 'lineargradient', 'stop', 'title'].includes(tag)
      ? 'http://www.w3.org/2000/svg'
      : 'http://www.w3.org/1999/xhtml';
    return new MockElement(tagName, this, ns);
  }

  createElementNS(namespaceURI, tagName) {
    return new MockElement(tagName, this, namespaceURI || 'http://www.w3.org/2000/svg');
  }

  createDocumentFragment() {
    return new MockElement('fragment', this);
  }

  getElementById(id) {
    return this._idMap.get(String(id)) || null;
  }

  querySelectorAll(selector) {
    // Fast path for single ID selector
    if (/^#[a-zA-Z0-9_-]+$/.test(selector.trim())) {
      const el = this.getElementById(selector.trim().slice(1));
      return el ? [el] : [];
    }
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this._listeners.has(type)) this._listeners.get(type).delete(listener);
  }

  dispatchEvent(event) {
    const evt = typeof event === 'string' ? { type: event } : event;
    const set = this._listeners.get(evt.type);
    if (set) {
      for (const fn of [...set]) {
        fn.call(this, evt);
      }
    }
    return true;
  }

  populateFromHtml(htmlString = getAssembledIndexHtml()) {
    // Parse all tags that have an `id` or key interactive classes (`.surface-filter-btn`, `.btn-plan-goal`, `.dist-preset-btn`, `.pace-preset-btn`, `.bottom-nav-btn`, `.plan-week-tab`)
    const tagOpenRegex = /<([a-zA-Z0-9]+)\b([^>]*)>/g;
    let match;
    while ((match = tagOpenRegex.exec(htmlString)) !== null) {
      const tag = match[1];
      const attrs = match[2] || '';
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/);
      const classMatch = attrs.match(/\bclass=["']([^"']+)["']/);
      const hasInteractiveClass =
        classMatch &&
        /\b(surface-filter-btn|btn-plan-goal|dist-preset-btn|pace-preset-btn|bottom-nav-btn|plan-week-tab)\b/.test(
          classMatch[1]
        );

      if (!idMatch && !hasInteractiveClass) continue;
      if (idMatch && this._idMap.has(idMatch[1])) continue;

      const el = this.createElement(tag);
      const attrPairRegex = /([a-zA-Z0-9_:-]+)=["']([^"']*)["']/g;
      let am;
      while ((am = attrPairRegex.exec(attrs)) !== null) {
        el.setAttribute(am[1], am[2]);
      }

      // Extract immediate text content up to closing tag if simple
      const afterIdx = match.index + match[0].length;
      const closeIdx = htmlString.indexOf(`</${tag}>`, afterIdx);
      if (closeIdx !== -1 && closeIdx - afterIdx < 400) {
        const rawInner = htmlString.slice(afterIdx, closeIdx);
        el._innerHTML = rawInner;
        el._textContent = rawInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      this.body.appendChild(el);
    }
  }
}

// -----------------------------------------------------------------------------
// Mock Leaflet & Google Maps Controllers
// -----------------------------------------------------------------------------

export function createMockLeaflet() {
  const createdMaps = [];
  const createdPolylines = [];
  const createdMarkers = [];
  const createdTileLayers = [];

  function createLayerInstance(type, payload = {}) {
    const listeners = new Map();
    const instance = {
      _type: type,
      ...payload,
      _map: null,
      _style: payload.options || {},
      addTo(map) {
        this._map = map;
        if (map && Array.isArray(map._layers)) {
          map._layers.push(this);
        }
        return this;
      },
      remove() {
        if (this._map && Array.isArray(this._map._layers)) {
          const i = this._map._layers.indexOf(this);
          if (i >= 0) this._map._layers.splice(i, 1);
        }
        this._map = null;
      },
      setLatLng(latlng) {
        this.latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
        return this;
      },
      getLatLng() {
        return this.latlng;
      },
      setLatLngs(latlngs) {
        this.latlngs = latlngs;
        return this;
      },
      getLatLngs() {
        return this.latlngs || [];
      },
      setStyle(style) {
        this._style = { ...this._style, ...style };
        return this;
      },
      setUrl(url) {
        this.url = url;
        return this;
      },
      getBounds() {
        return {
          _latlngs: this.latlngs || [],
          isValid: () => true
        };
      },
      on(evt, fn) {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt).add(fn);
        return this;
      },
      fire(evt, data = {}) {
        const set = listeners.get(evt);
        if (set) {
          for (const fn of [...set]) fn(data);
        }
        return this;
      }
    };
    return instance;
  }

  const L = {
    createdMaps,
    createdPolylines,
    createdMarkers,
    createdTileLayers,
    map(element, options = {}) {
      const listeners = new Map();
      const mapInstance = {
        element,
        options,
        _layers: [],
        _center: { lat: 41.3857, lng: -81.7058 },
        _zoom: 15,
        _boundsFitted: null,
        _invalidatedCount: 0,
        setView(center, zoom) {
          this._center = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;
          if (zoom !== undefined) this._zoom = zoom;
          return this;
        },
        panTo(center) {
          this._center = Array.isArray(center) ? { lat: center[0], lng: center[1] } : center;
          return this;
        },
        setZoom(zoom) {
          this._zoom = zoom;
          return this;
        },
        getZoom() {
          return this._zoom;
        },
        getCenter() {
          return this._center;
        },
        fitBounds(bounds, opts = {}) {
          this._boundsFitted = { bounds, opts };
          return this;
        },
        invalidateSize() {
          this._invalidatedCount += 1;
          return this;
        },
        removeLayer(layer) {
          if (layer && typeof layer.remove === 'function') layer.remove();
          return this;
        },
        hasLayer(layer) {
          return this._layers.includes(layer);
        },
        on(evt, fn) {
          if (!listeners.has(evt)) listeners.set(evt, new Set());
          listeners.get(evt).add(fn);
          return this;
        },
        off(evt, fn) {
          if (listeners.has(evt)) listeners.get(evt).delete(fn);
          return this;
        },
        fire(evt, data = {}) {
          const set = listeners.get(evt);
          if (set) {
            for (const fn of [...set]) fn(data);
          }
          return this;
        }
      };
      createdMaps.push(mapInstance);
      return mapInstance;
    },
    tileLayer(url, options = {}) {
      const tl = createLayerInstance('tileLayer', { url, options });
      createdTileLayers.push(tl);
      return tl;
    },
    polyline(latlngs, options = {}) {
      const pl = createLayerInstance('polyline', { latlngs, options });
      createdPolylines.push(pl);
      return pl;
    },
    marker(latlng, options = {}) {
      const mk = createLayerInstance('marker', {
        latlng: Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng,
        options
      });
      createdMarkers.push(mk);
      return mk;
    },
    divIcon(options = {}) {
      return { _type: 'divIcon', ...options };
    },
    latLngBounds(latlngs = []) {
      const points = Array.isArray(latlngs) ? [...latlngs] : [];
      return {
        points,
        extend(pt) {
          points.push(pt);
          return this;
        },
        isValid() {
          return points.length > 0;
        }
      };
    }
  };

  return L;
}

export function createMockGoogleMaps() {
  const polylines = [];
  const markers = [];

  class MockLatLngBounds {
    constructor() {
      this.points = [];
    }
    extend(pt) {
      this.points.push(pt);
    }
  }

  class MockPolyline {
    constructor(opts = {}) {
      this.opts = opts;
      this.map = opts.map ?? null;
      this.path = opts.path || [];
      polylines.push(this);
    }
    setMap(m) {
      this.map = m;
    }
    setPath(p) {
      this.path = p;
    }
    setOptions(o) {
      this.opts = { ...this.opts, ...o };
    }
  }

  class MockAdvancedMarkerElement {
    constructor(opts = {}) {
      this.map = opts.map ?? null;
      this.position = opts.position ?? null;
      this.content = opts.content ?? null;
      this.title = opts.title ?? '';
      this.zIndex = opts.zIndex ?? 1;
      markers.push(this);
    }
  }

  class MockGoogleMap {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.center = opts.center || { lat: 41.3857, lng: -81.7058 };
      this.zoom = opts.zoom || 15;
      this.mapTypeId = opts.mapTypeId || 'roadmap';
      this._listeners = new Map();
      this._fittedBounds = null;
    }
    setCenter(c) {
      this.center = c;
    }
    panTo(c) {
      this.center = c;
    }
    setZoom(z) {
      this.zoom = z;
    }
    getZoom() {
      return this.zoom;
    }
    setMapTypeId(id) {
      this.mapTypeId = id;
    }
    fitBounds(b, padding) {
      this._fittedBounds = { bounds: b, padding };
    }
    addListener(evt, fn) {
      if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
      this._listeners.get(evt).add(fn);
      return { remove: () => this._listeners.get(evt)?.delete(fn) };
    }
    trigger(evt, payload = {}) {
      const set = this._listeners.get(evt);
      if (set) {
        for (const fn of [...set]) fn(payload);
      }
    }
  }

  return {
    polylines,
    markers,
    Map: MockGoogleMap,
    Polyline: MockPolyline,
    LatLngBounds: MockLatLngBounds,
    AdvancedMarkerElement: MockAdvancedMarkerElement,
    event: {
      trigger(instance, evt, payload) {
        if (instance && typeof instance.trigger === 'function') {
          instance.trigger(evt, payload);
        }
      }
    }
  };
}

// -----------------------------------------------------------------------------
// Deterministic Mock Fetch (OSRM, Overpass, Open-Meteo, Nominatim, Photon, Spotify)
// -----------------------------------------------------------------------------

function haversineMetersSimple(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function createMockFetch(options = {}) {
  const calls = [];
  const osrmDetourFactor = options.osrmDetourFactor ?? 1.25;
  const osrmSnapOffsetMeters = options.osrmSnapOffsetMeters ?? 0;

  const mockFetch = async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : input?.url || String(input);
    calls.push({ url: urlStr, init });

    if (typeof options.customHandler === 'function') {
      const customResult = await options.customHandler(urlStr, init, calls);
      if (customResult !== undefined) {
        return customResult;
      }
    }

    // 1. OSRM Foot Routing API
    if (urlStr.includes('router.project-osrm.org/route/v1/foot/')) {
      if (options.osrmShouldFail) {
        return createJsonResponse({ message: 'OSRM Error' }, 500);
      }
      const match = urlStr.match(/\/route\/v1\/foot\/([^?]+)/);
      const coordPairs = (match ? match[1].split(';') : []).map((pair) => {
        const [lng, lat] = pair.split(',').map(Number);
        return { lat, lng };
      });

      const latOffset = osrmSnapOffsetMeters / 111320;
      const coordinates = [];
      let rawMeters = 0;

      for (let i = 0; i < coordPairs.length; i++) {
        const pt = coordPairs[i];
        coordinates.push([Number(pt.lng.toFixed(6)), Number((pt.lat + latOffset).toFixed(6))]);
        if (i > 0) {
          rawMeters += haversineMetersSimple(coordPairs[i - 1], pt);
          // Add intermediate street vertex
          const midLat = (coordPairs[i - 1].lat + pt.lat) / 2 + latOffset;
          const midLng = (coordPairs[i - 1].lng + pt.lng) / 2;
          coordinates.splice(coordinates.length - 1, 0, [
            Number(midLng.toFixed(6)),
            Number(midLat.toFixed(6))
          ]);
        }
      }

      const routeDistanceMeters = options.fixedOsrmDistanceMeters ?? rawMeters * osrmDetourFactor;

      return createJsonResponse({
        code: 'Ok',
        routes: [
          {
            distance: routeDistanceMeters,
            duration: routeDistanceMeters / 2.9,
            geometry: {
              type: 'LineString',
              coordinates
            },
            legs: [
              {
                steps: [
                  {
                    distance: routeDistanceMeters * 0.35,
                    name: 'West Creek Greenway Trail',
                    maneuver: { type: 'depart', modifier: 'straight', location: coordinates[0] }
                  },
                  {
                    distance: routeDistanceMeters * 0.4,
                    name: 'Parkview Lit Boulevard',
                    maneuver: {
                      type: 'turn',
                      modifier: 'left',
                      location: coordinates[Math.floor(coordinates.length / 2)]
                    }
                  },
                  {
                    distance: routeDistanceMeters * 0.25,
                    name: 'West Creek Greenway Trail',
                    maneuver: {
                      type: 'arrive',
                      modifier: 'straight',
                      location: coordinates[coordinates.length - 1]
                    }
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    // 2. OSM Overpass API
    if (urlStr.includes('overpass-api.de/api/interpreter')) {
      if (options.overpassShouldFail) {
        return createJsonResponse({ error: 'Overpass timeout' }, 504);
      }
      const elements = options.overpassElements ?? [
        { type: 'way', id: 1, tags: { highway: 'footway', lit: 'yes', sidewalk: 'both', surface: 'asphalt' } },
        { type: 'way', id: 2, tags: { highway: 'cycleway', lit: 'yes', surface: 'paved' } },
        { type: 'way', id: 3, tags: { highway: 'residential', lit: 'yes', sidewalk: 'both', surface: 'asphalt' } },
        { type: 'way', id: 4, tags: { highway: 'path', lit: 'no', surface: 'fine_gravel' } },
        { type: 'way', id: 5, tags: { highway: 'residential', lit: 'yes', sidewalk: 'right', surface: 'concrete' } }
      ];
      return createJsonResponse({ elements });
    }

    // 3. Open-Meteo Elevation API
    if (urlStr.includes('api.open-meteo.com/v1/elevation')) {
      if (options.elevationShouldFail) {
        return createJsonResponse({ error: true }, 500);
      }
      const u = new URL(urlStr);
      const lats = (u.searchParams.get('latitude') || '').split(',').filter(Boolean);
      const customElevations = options.elevationsMeters;
      const elevation = lats.map((_, idx) => {
        if (Array.isArray(customElevations) && customElevations.length > 0) {
          return customElevations[idx % customElevations.length];
        }
        return Number((212.5 + Math.sin(idx * 0.7) * 14.2 + idx * 1.8).toFixed(1));
      });
      return createJsonResponse({ elevation });
    }

    // 4. Open-Meteo Forecast Weather API
    if (urlStr.includes('api.open-meteo.com/v1/forecast')) {
      return createJsonResponse({
        current: {
          temperature_2m: 64.4,
          relative_humidity_2m: 52,
          apparent_temperature: 63.0,
          precipitation_probability: 10,
          precipitation: 0,
          weather_code: 1,
          wind_speed_10m: 6.2,
          uv_index: 4,
          is_day: 1
        }
      });
    }

    // 5. Nominatim / Photon Geocoding
    if (urlStr.includes('nominatim.openstreetmap.org')) {
      return createJsonResponse([
        {
          lat: '41.385700',
          lon: '-81.705800',
          display_name: 'West Creek Reservation, 2277 West Ridgewood Drive, Parma, Ohio 44134',
          address: {
            leisure: 'West Creek Reservation',
            house_number: '2277',
            road: 'West Ridgewood Drive',
            city: 'Parma',
            state: 'Ohio',
            postcode: '44134'
          }
        }
      ]);
    }

    if (urlStr.includes('photon.komoot.io')) {
      return createJsonResponse({
        features: [
          {
            geometry: { coordinates: [-81.7058, 41.3857] },
            properties: {
              name: 'West Creek Reservation',
              housenumber: '2277',
              street: 'West Ridgewood Drive',
              city: 'Parma',
              state: 'Ohio',
              postcode: '44134'
            }
          }
        ]
      });
    }

    // 6. Spotify PKCE & Web API
    if (urlStr.includes('accounts.spotify.com/api/token') || urlStr.includes('/api/spotify/token')) {
      return createJsonResponse({
        access_token: 'mock_spotify_pkce_access_token_123',
        refresh_token: 'mock_spotify_pkce_refresh_token_456',
        token_type: 'Bearer',
        expires_in: 3600
      });
    }

    if (urlStr.includes('/api/spotify/auth/url')) {
      if (options.disableSpotifyDevMiddleware) {
        return createJsonResponse({ error: 'Not Found' }, 404);
      }
      const u = new URL(urlStr, 'http://localhost:3000');
      const clientId = u.searchParams.get('client_id') || 'paceplot_client_id';
      const redirectUri = u.searchParams.get('redirect_uri') || 'http://localhost:3000/auth/callback';
      const codeChallenge = u.searchParams.get('code_challenge') || 'challenge';
      const state = u.searchParams.get('state') || 'state';
      return createJsonResponse({
        configured: true,
        redirectUri,
        url: `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${encodeURIComponent(codeChallenge)}&state=${encodeURIComponent(state)}`
      });
    }

    if (urlStr.includes('api.spotify.com/v1/me/playlists')) {
      return createJsonResponse({
        items: [
          {
            id: 'user_pl_1',
            uri: 'spotify:playlist:user_pl_1',
            name: 'Runner Custom Marathon Mix',
            tracks: { total: 12 }
          }
        ]
      });
    }

    if (urlStr.includes('api.spotify.com/v1/me')) {
      return createJsonResponse({
        id: 'runner_spotify_user',
        display_name: 'Pace Plot Runner',
        product: 'premium'
      });
    }

    return createJsonResponse({ ok: true });
  };

  mockFetch.calls = calls;
  return mockFetch;
}

export function createJsonResponse(data, status = 200) {
  const bodyText = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Map([['content-type', 'application/json']]),
    _bodyText: bodyText,
    async json() {
      return typeof data === 'string' ? JSON.parse(data) : data;
    },
    async text() {
      return bodyText;
    },
    clone() {
      return createJsonResponse(data, status);
    }
  };
}

// -----------------------------------------------------------------------------
// Timer Tracking & Cleanup (prevents leaked intervals/timeouts from hanging Node)
// -----------------------------------------------------------------------------

const _origSetTimeout = globalThis.setTimeout.bind(globalThis);
const _origClearTimeout = globalThis.clearTimeout.bind(globalThis);
const _origSetInterval = globalThis.setInterval.bind(globalThis);
const _origClearInterval = globalThis.clearInterval.bind(globalThis);

const trackedIntervals = new Set();
const trackedTimeouts = new Set();

function clearTrackedTimers() {
  for (const id of trackedIntervals) {
    _origClearInterval(id);
  }
  trackedIntervals.clear();
  for (const id of trackedTimeouts) {
    _origClearTimeout(id);
  }
  trackedTimeouts.clear();
}

function trackedSetInterval(fn, delay, ...args) {
  const id = _origSetInterval(fn, delay, ...args);
  if (id && typeof id.unref === 'function') {
    id.unref();
  }
  trackedIntervals.add(id);
  return id;
}

function trackedClearInterval(id) {
  trackedIntervals.delete(id);
  return _origClearInterval(id);
}

function trackedSetTimeout(fn, delay, ...args) {
  const id = _origSetTimeout((...cbArgs) => {
    trackedTimeouts.delete(id);
    if (typeof fn === 'function') {
      return fn(...cbArgs);
    }
  }, delay, ...args);
  if (id && typeof id.unref === 'function' && Number(delay) >= 500) {
    id.unref();
  }
  trackedTimeouts.add(id);
  return id;
}

function trackedClearTimeout(id) {
  trackedTimeouts.delete(id);
  return _origClearTimeout(id);
}

export function setupMockBrowserEnv(options = {}) {
  clearTrackedTimers();
  const localStorage = createMemoryStorage(options.initialLocalStorage || {});
  const sessionStorage = createMemoryStorage();
  const caches = createMockCacheStorage();
  const document = new MockDocument();

  if (options.populateHtml !== false) {
    document.populateFromHtml(getAssembledIndexHtml());
  }

  const mockLeaflet = createMockLeaflet();
  const mockGoogleMaps = createMockGoogleMaps();
  const mockFetch = createMockFetch(options.fetchOptions || {});

  const spokenUtterances = [];
  const speechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    spokenUtterances,
    getVoices() {
      return [
        { name: 'Google US English', lang: 'en-US', default: true },
        { name: 'Samantha', lang: 'en-US', default: false }
      ];
    },
    speak(utterance) {
      spokenUtterances.push(utterance?.text || String(utterance));
      if (utterance && typeof utterance.onstart === 'function') utterance.onstart();
      if (utterance && typeof utterance.onend === 'function') utterance.onend();
    },
    cancel() {
      this.speaking = false;
    },
    addEventListener() {}
  };

  class MockSpeechSynthesisUtterance {
    constructor(text = '') {
      this.text = text;
      this.lang = 'en-US';
      this.rate = 1.0;
      this.pitch = 1.0;
      this.volume = 1.0;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
        start() {},
        stop() {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; }
      };
    }
  }

  const geolocationWatches = new Map();
  let nextWatchId = 1;
  const geolocation = {
    watches: geolocationWatches,
    getCurrentPosition(success) {
      if (typeof success === 'function') {
        success({
          coords: {
            latitude: 41.3857,
            longitude: -81.7058,
            accuracy: 8,
            speed: 3.35
          },
          timestamp: Date.now()
        });
      }
    },
    watchPosition(success, error, opts) {
      const id = nextWatchId++;
      geolocationWatches.set(id, { success, error, opts });
      return id;
    },
    clearWatch(id) {
      geolocationWatches.delete(id);
    }
  };

  let bleCharacteristicListener = null;
  const bluetooth = {
    triggerHeartRateNotification(bytesArray) {
      if (bleCharacteristicListener) {
        const buf = new Uint8Array(bytesArray).buffer;
        bleCharacteristicListener({
          target: { value: new DataView(buf) }
        });
      }
    },
    async requestDevice() {
      return {
        id: 'polar-h10-mock',
        name: 'Polar H10 9A4F',
        addEventListener() {},
        gatt: {
          connected: true,
          async connect() {
            return {
              async getPrimaryService() {
                return {
                  async getCharacteristic() {
                    return {
                      async startNotifications() {
                        return this;
                      },
                      addEventListener(evt, fn) {
                        if (evt === 'characteristicvaluechanged') {
                          bleCharacteristicListener = fn;
                        }
                      }
                    };
                  }
                };
              }
            };
          }
        }
      };
    }
  };

  const swMessages = [];
  const serviceWorker = {
    controller: { postMessage(msg) { swMessages.push(msg); } },
    ready: Promise.resolve({
      sync: { async register() {} },
      periodicSync: { async register() {} }
    }),
    async register() {
      return {
        scope: '/',
        sync: { async register() {} },
        periodicSync: { async register() {} }
      };
    },
    addEventListener() {}
  };

  const navigatorObj = {
    onLine: options.onLine ?? true,
    platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) PacePlotTest/1.0',
    geolocation,
    bluetooth,
    serviceWorker,
    vibrate() { return true; },
    clipboard: {
      copiedText: '',
      async writeText(t) {
        this.copiedText = String(t);
      }
    },
    wakeLock: {
      async request() {
        return {
          released: false,
          async release() {
            this.released = true;
          },
          addEventListener() {}
        };
      }
    },
    async getBattery() {
      return {
        level: options.batteryLevel ?? 0.88,
        charging: false
      };
    },
    async share(shareData) {
      navigatorObj._lastShared = shareData;
    }
  };

  const windowListeners = new Map();
  const openedWindows = [];
  const locationUrl = new URL(options.url || 'http://localhost:3000/');

  const windowObj = {
    document,
    localStorage,
    sessionStorage,
    caches,
    navigator: navigatorObj,
    fetch: mockFetch,
    speechSynthesis,
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    L: mockLeaflet,
    google: { maps: mockGoogleMaps },
    __activeLeafletMap: null,
    crypto: globalThis.crypto,
    location: {
      href: locationUrl.href,
      origin: locationUrl.origin,
      protocol: locationUrl.protocol,
      host: locationUrl.host,
      hostname: locationUrl.hostname,
      port: locationUrl.port,
      pathname: locationUrl.pathname,
      search: locationUrl.search,
      hash: locationUrl.hash,
      reload() {},
      assign(u) { this.href = u; },
      replace(u) { this.href = u; }
    },
    history: {
      replaceState(_state, _title, url) {
        if (url) {
          const next = new URL(url, windowObj.location.origin);
          windowObj.location.pathname = next.pathname;
          windowObj.location.search = next.search;
          windowObj.location.href = next.href;
        }
      },
      pushState(_state, _title, url) {
        this.replaceState(_state, _title, url);
      }
    },
    openedWindows,
    open(url, name, specs) {
      const popup = { url, name, specs, closed: false, close() { this.closed = true; } };
      openedWindows.push(popup);
      return popup;
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (windowListeners.has(type)) windowListeners.get(type).delete(fn);
    },
    dispatchEvent(evt) {
      const set = windowListeners.get(evt.type);
      if (set) {
        for (const fn of [...set]) fn(evt);
      }
      return true;
    },
    ResizeObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    URL: {
      createObjectURL() { return 'blob:http://localhost:3000/mock-blob-id'; },
      revokeObjectURL() {}
    },
    setTimeout: trackedSetTimeout,
    clearTimeout: trackedClearTimeout,
    setInterval: trackedSetInterval,
    clearInterval: trackedClearInterval
  };

  // Install onto globalThis
  globalThis.window = windowObj;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.caches = caches;
  globalThis.fetch = mockFetch;
  globalThis.L = mockLeaflet;
  globalThis.google = windowObj.google;
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  globalThis.AudioContext = MockAudioContext;
  globalThis.ResizeObserver = windowObj.ResizeObserver;
  globalThis.setTimeout = trackedSetTimeout;
  globalThis.clearTimeout = trackedClearTimeout;
  globalThis.setInterval = trackedSetInterval;
  globalThis.clearInterval = trackedClearInterval;
  Object.defineProperty(globalThis, 'navigator', {
    value: navigatorObj,
    configurable: true,
    writable: true
  });

  if (typeof globalThis.URL.createObjectURL !== 'function') {
    globalThis.URL.createObjectURL = windowObj.URL.createObjectURL;
    globalThis.URL.revokeObjectURL = windowObj.URL.revokeObjectURL;
  }

  return {
    window: windowObj,
    document,
    localStorage,
    sessionStorage,
    caches,
    navigator: navigatorObj,
    fetch: mockFetch,
    L: mockLeaflet,
    googleMaps: mockGoogleMaps,
    speechSynthesis,
    spokenUtterances,
    geolocation,
    bluetooth
  };
}
