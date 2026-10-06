#!/usr/bin/env node
/**
 * Tests for the pure parsers in seo-facts.js. Run: node skills/scan/scripts/seo-facts.test.cjs
 */

const assert = require("assert");
const { parsePage, parseRobots, parseSitemap } = require("./seo-facts.js");

const html = `<!doctype html><html lang="nl"><head>
<title>Schilderwerk Rotterdam &amp; omgeving</title>
<meta content="Buiten- en binnenschilderwerk." name="description">
<meta name='robots' content='noindex, nofollow'>
<link rel="canonical" href="https://example.nl/schilderwerk">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["Service","Thing"]}]}</script>
<script type="application/ld+json">{ broken </script>
</head><body><h1>Schilder<span>werk</span> in Rotterdam</h1><h1>Tweede</h1></body></html>`;

const page = parsePage(html);
assert.strictEqual(page.title, "Schilderwerk Rotterdam & omgeving");
assert.strictEqual(
  page.description,
  "Buiten- en binnenschilderwerk.",
  "attribute order",
);
assert.strictEqual(page.robots, "noindex, nofollow", "single quotes");
assert.strictEqual(page.canonical, "https://example.nl/schilderwerk");
assert.strictEqual(page.lang, "nl");
assert.deepStrictEqual(page.h1, ["Schilder werk in Rotterdam", "Tweede"]);
assert.deepStrictEqual(page.jsonLdTypes.sort(), [
  "Organization",
  "Service",
  "Thing",
]);
assert.strictEqual(page.jsonLdErrors, 1);

const empty = parsePage("<html><body>niets</body></html>");
assert.strictEqual(empty.title, null);
assert.deepStrictEqual(empty.h1, []);
assert.deepStrictEqual(empty.jsonLdTypes, []);

const robots = parseRobots(
  "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nSitemap: https://example.nl/sitemap.xml # main\n",
);
assert.deepStrictEqual(robots.sitemaps, ["https://example.nl/sitemap.xml"]);
assert.strictEqual(robots.disallowAll, false, "only Googlebot is blocked");
assert.strictEqual(parseRobots("User-agent: *\nDisallow: /").disallowAll, true);

const sitemap = parseSitemap(
  "<urlset><url><loc>https://example.nl/</loc></url><url><loc> https://example.nl/a?x=1&amp;y=2 </loc></url></urlset>",
);
assert.strictEqual(sitemap.index, false);
assert.deepStrictEqual(sitemap.locs, [
  "https://example.nl/",
  "https://example.nl/a?x=1&y=2",
]);
assert.strictEqual(
  parseSitemap(
    "<sitemapindex><sitemap><loc>https://example.nl/s1.xml</loc></sitemap></sitemapindex>",
  ).index,
  true,
);

console.log("seo-facts: all tests passed");
