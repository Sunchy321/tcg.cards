import { auth } from '~~/server/lib/auth'; // import your auth config

export default defineEventHandler(event => {
  return auth.handler(toWebRequest(event));
});
