/**
 * Run axe-core against the current page.
 *
 *   playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/axe.js"
 *
 * axe is the accessibility engine behind Lighthouse and most commercial tooling:
 * ~90 rules, no install, loaded from a CDN at run time. It covers the mechanical
 * checks well. It does NOT cover contrast over a canvas or a gradient, state that
 * only exists after a scroll, or whether focus went somewhere sensible — that is
 * what the qa.* probes and the recipes are for. Run both.
 *
 * Output is deliberately compact: rule, impact, why it matters, and up to three
 * offending nodes. Re-run after interacting to catch what only exists then.
 */
async page => {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

  const present = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (!present) {
    try {
      await page.addScriptTag({ url: CDN });
    } catch (err) {
      return JSON.stringify({
        error: 'could not load axe-core',
        reason: String(err).slice(0, 200),
        hint: 'the page CSP may block external scripts, or there is no network — fall back to the qa.* probes',
      });
    }
  }

  const loaded = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (!loaded) {
    return JSON.stringify({
      error: 'axe-core did not initialise',
      hint: 'almost always a Content-Security-Policy blocking the CDN script',
    });
  }

  const result = await page.evaluate(async () => {
    const run = await window.axe.run(document, {
      resultTypes: ['violations'],
      // Ignore the two "needs review" families: they produce noise a human has to
      // arbitrate anyway, and this report should only carry things it can prove.
      rules: { 'color-contrast-enhanced': { enabled: false } },
    });

    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const violations = run.violations.map((v) => {
      byImpact[v.impact] = (byImpact[v.impact] ?? 0) + v.nodes.length;
      return {
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
        helpUrl: v.helpUrl.split('?')[0],
        nodes: v.nodes.slice(0, 3).map((n) => ({
          target: n.target.join(' '),
          html: n.html.replace(/\s+/g, ' ').slice(0, 120),
          failure: (n.failureSummary || '').split('\n').filter(Boolean).slice(1, 3).join(' / ').slice(0, 200),
        })),
      };
    });

    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    violations.sort((a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9) || b.count - a.count);

    return {
      url: location.pathname,
      axeVersion: window.axe.version,
      totalViolations: violations.length,
      affectedNodes: Object.values(byImpact).reduce((a, b) => a + b, 0),
      byImpact,
      passes: run.passes?.length ?? null,
      violations,
    };
  });

  return JSON.stringify(result, null, 1);
}
