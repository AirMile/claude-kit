// Evaluated inside a page by the audit skill. Returns a JSON-serialisable summary.
(() => {
  const abs = (u) => {
    try {
      return new URL(u, location.href);
    } catch {
      return null;
    }
  };
  const meta = (sel) =>
    document.querySelector(sel)?.getAttribute("content") || null;

  const images = [...document.images].map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.getAttribute("alt"),
    natural: [img.naturalWidth, img.naturalHeight],
    rendered: [img.clientWidth, img.clientHeight],
  }));
  const visible = (el) =>
    el.offsetParent !== null || el.getClientRects().length > 0;
  const unlabeled = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => el.type !== "hidden" && visible(el))
    .filter((el) => {
      const id =
        el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      return (
        !id &&
        !el.closest("label") &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("aria-labelledby")
      );
    })
    .map((el) => el.name || el.id || el.outerHTML.slice(0, 80));

  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => abs(a.getAttribute("href")))
    .filter((u) => u && u.origin === location.origin)
    .map((u) => u.pathname + u.search);

  return {
    url: location.pathname,
    title: document.title || null,
    description: meta('meta[name="description"]'),
    ogImage: meta('meta[property="og:image"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.href || null,
    lang: document.documentElement.lang || null,
    h1Count: document.querySelectorAll("h1").length,
    imagesWithoutAlt: images.filter((i) => i.alt === null).map((i) => i.src),
    // natural width more than 2x the rendered width: downloaded far bigger than shown
    oversizedImages: images
      .filter(
        (i) =>
          i.rendered[0] > 0 &&
          i.natural[0] > i.rendered[0] * 2 * (window.devicePixelRatio || 1),
      )
      .map((i) => ({ src: i.src, natural: i.natural, rendered: i.rendered })),
    unlabeledInputs: unlabeled,
    // null when there is no real viewport (hidden or zero-width window): not measurable
    horizontalOverflow:
      document.documentElement.clientWidth === 0
        ? null
        : document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
    internalLinks: [...new Set(links)],
  };
})();
