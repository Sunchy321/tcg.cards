import postgres from 'postgres';

import { getConnectionString } from '#db/db';

let client: ReturnType<typeof postgres> | null = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? getConnectionString();
}

function getClient() {
  client ??= postgres(getDatabaseUrl(), { max: 1 });
  return client;
}

export async function getRandomCardId() {
  const rows = await getClient().unsafe<{ card_id: string }[]>(`
    select card_id
    from hearthstone.card_entity_view
    where lang = 'en'
      and collectible = true
      and in_bobs_tavern = false
      and type in ('minion', 'spell', 'weapon', 'location', 'hero')
      and (
        type in ('minion', 'spell', 'weapon', 'location')
        or (
          type = 'hero'
          and (
            nullif(btrim(display_text), '') is not null
            or armor is not null
          )
        )
      )
    order by random()
    limit 1
  `);

  return rows[0]?.card_id ?? null;
}
