#!/usr/bin/env node
/**
 * Collect the technical search facts of a live site, as JSON on stdout:
 * robots.txt, sitemaps, and per page (sitemap first, max 10) the status,
 * title, description, robots meta, canonical, h1, lang and JSON-LD types.
 * Exit 0 = facts printed, 2 = bad URL or the home page did not answer.
 *
 * Usage: node seo-facts.js <url> [maxPages]
 */

const MAX_PAGES = 10;
const TIMEOUT_MS = 15000;
const UA = "kit-scan/1.0 (site check)";

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

const text = (html) =>
  decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function attr(tag, name) {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

function metaContent(html, key, value) {
  const tag = tags(html, "meta").find(
    (t) => (attr(t, key) || "").toLowerCase() === value,
  );
  return tag ? attr(tag, "content") : null;
}

/** Collect every @type in a JSON-LD value, including @graph members. */
function ldTypes(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) ldTypes(n, out);
  } else if (node && typeof node === "object") {
    const t = node["@type"];
    if (t) for (const one of [].concat(t)) out.add(String(one));
    if (node["@graph"]) ldTypes(node["@graph"], out);
  }
  return out;
}

function parsePage(html) {
  const types = new Set();
  let jsonLdErrors = 0;
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of scripts) {
    try {
      ldTypes(JSON.parse(body), types);
    } catch {
      jsonLdErrors++;
    }
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const canonical = tags(html, "link").find((t) =>
    (attr(t, "rel") || "").toLowerCase().split(/\s+/).includes("canonical"),
  );
  const htmlTag = tags(html, "html")[0];
  return {
    title: title ? text(title[1]) || null : null,
    description: metaContent(html, "name", "description"),
    robots: metaContent(html, "name", "robots"),
    canonical: canonical ? attr(canonical, "href") : null,
    lang: htmlTag ? attr(htmlTag, "lang") : null,
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
      text(m[1]),
    ),
    jsonLdTypes: [...types],
    jsonLdErrors,
  };
}

function parseRobots(txt) {
  const sitemaps = [];
  let star = false;
  let disallowAll = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = (key || "").toLowerCase();
    if (k === "sitemap" && value) sitemaps.push(value);
    else if (k === "user-agent") star = value === "*";
    else if (k === "disallow" && star && value === "/") disallowAll = true;
  }
  return { sitemaps, disallowAll };
}

/** `<loc>` entries; `index` is true for a sitemap index (its locs are sitemaps). */
function parseSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) =>
    decode(m[1]),
  );
  return { index: /<sitemapindex\b/i.test(xml), locs };
}

async function get(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      status: res.status,
      finalUrl: res.url,
      ms: Date.now() - started,
      xRobots: res.headers.get("x-robots-tag"),
      body: await res.text(),
    };
  } catch (err) {
    return {
      status: 0,
      error: String(err.cause?.code || err.name || err),
      ms: Date.now() - started,
    };
  }
}

async function main() {
  let origin;
  try {
    origin = new URL(process.argv[2]).origin;
  } catch {
    console.error("usage: node seo-facts.js <url> [maxPages]");
    process.exit(2);
  }
  const max = Number(process.argv[3]) || MAX_PAGES;

  const robotsRes = await get(`${origin}/robots.txt`);
  const robots =
    robotsRes.status === 200
      ? parseRobots(robotsRes.body)
      : { sitemaps: [], disallowAll: false };

  // Every sitemap robots.txt names (else the default path), each reported:
  // an empty one listed in robots.txt is a finding too. An index is followed
  // into its first five child sitemaps.
  const candidates = robots.sitemaps.length
    ? robots.sitemaps
    : [`${origin}/sitemap.xml`];
  const sitemaps = [];
  let urls = [];
  for (const url of candidates.slice(0, 5)) {
    const res = await get(url);
    let locs = [];
    if (res.status === 200) {
      const parsed = parseSitemap(res.body);
      if (parsed.index) {
        for (const child of parsed.locs.slice(0, 5)) {
          const childRes = await get(child);
          if (childRes.status === 200)
            locs.push(...parseSitemap(childRes.body).locs);
        }
      } else {
        locs = parsed.locs;
      }
    }
    sitemaps.push({ url, status: res.status, urlCount: locs.length });
    urls.push(...locs);
  }
  urls = [...new Set(urls)];
  const inSitemap = new Set(urls.map((u) => u.replace(/\/$/, "")));

  const home = await get(`${origin}/`);
  if (home.status === 0 || home.status >= 500) {
    console.log(
      JSON.stringify(
        { origin, error: `home did not answer (${home.error || home.status})` },
        null,
        2,
      ),
    );
    process.exit(2);
  }
  // No sitemap: the home page and its internal links stand in for it.
  if (urls.length === 0) {
    const links = tags(home.body, "a")
      .map((t) => attr(t, "href"))
      .filter(Boolean)
      .map((h) => {
        try {
          return new URL(h, `${origin}/`);
        } catch {
          return null;
        }
      })
      .filter(
        (u) =>
          u &&
          u.origin === origin &&
          !/\.(pdf|jpe?g|png|webp|svg|zip)$/i.test(u.pathname),
      )
      .map((u) => u.origin + u.pathname);
    urls = [...new Set(links)];
  }
  const pages = [
    `${origin}/`,
    ...urls.filter((u) => u.replace(/\/$/, "") !== origin),
  ].slice(0, max);

  const results = [];
  for (const url of pages) {
    const res = url === `${origin}/` ? home : await get(url);
    const facts = res.status === 200 ? parsePage(res.body) : {};
    results.push({
      url,
      status: res.status,
      ...(res.finalUrl &&
        res.finalUrl !== url && { redirectedTo: res.finalUrl }),
      ms: res.ms,
      inSitemap: inSitemap.has(url.replace(/\/$/, "")),
      ...(res.xRobots && { xRobotsTag: res.xRobots }),
      ...facts,
      ...(res.error && { error: res.error }),
    });
  }

  console.log(
    JSON.stringify(
      {
        origin,
        robotsTxt: { status: robotsRes.status, ...robots },
        sitemaps,
        pages: results,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) main();

module.exports = { parsePage, parseRobots, parseSitemap };
