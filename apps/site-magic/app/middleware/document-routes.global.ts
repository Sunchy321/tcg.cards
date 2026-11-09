/** Keeps historical reading, comparison and history links on the public document address. */
export default defineNuxtRouteMiddleware(to => {
  const legacyRule = /^\/rule(?:\/(diff|history))?\/?$/.exec(to.path);
  const legacyDocument = /^\/document\/cr(?=\/|$)/.test(to.path);
  if (!legacyRule && !legacyDocument) return;
  const path = legacyRule
    ? `/document/comprehensive-rules${legacyRule[1] ? `/${legacyRule[1]}` : ''}`
    : to.path.replace(/^\/document\/cr(?=\/|$)/, '/document/comprehensive-rules');
  const query = { ...to.query };
  if (legacyRule) {
    if (typeof query.date === 'string' && query.version == null) query.version = query.date.replaceAll('-', '');
    delete query.date;
    if (legacyRule[1] === 'diff') {
      for (const key of ['from', 'to']) {
        if (typeof query[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query[key])) query[key] = query[key].replaceAll('-', '');
      }
    }
    if (typeof query.lang === 'string' && query.locale == null) query.locale = query.lang;
    delete query.lang;
  }
  return navigateTo({ path, query, hash: to.hash }, { redirectCode: 301 });
});
