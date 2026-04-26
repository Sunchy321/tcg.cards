const methodsWithoutBody = new Set(['GET', 'HEAD']);

export default defineEventHandler(async event => {
  const baseURL = process.env.INTERNAL_AUTH_URL ?? 'http://localhost:2998';
  const requestURL = getRequestURL(event);
  const targetURL = new URL(`${requestURL.pathname}${requestURL.search}`, baseURL);
  const method = getMethod(event).toUpperCase();
  const headers = new Headers();

  for (const [key, value] of Object.entries(getHeaders(event))) {
    if (value != null) {
      headers.set(key, value);
    }
  }

  headers.delete('host');
  headers.delete('content-length');

  const body = methodsWithoutBody.has(method)
    ? undefined
    : await readRawBody(event);

  return fetch(targetURL, {
    method,
    headers,
    body,
    redirect: 'manual',
  });
});
