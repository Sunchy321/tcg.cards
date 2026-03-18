<script setup lang="ts">
import { GAMES } from '#shared';
import { authClient } from '~/composables/auth';

const session = authClient.useSession();

const role = computed(() => (session.value.data?.user as { role?: string } | undefined)?.role ?? null);

const firstGame = computed(() => {
  const r = role.value;
  if (!r) return GAMES[0];
  if (r === 'owner' || r === 'admin') return GAMES[0];
  if (r.startsWith('admin/')) {
    const game = r.slice('admin/'.length);
    if ((GAMES as readonly string[]).includes(game)) return game;
  }
  return GAMES[0];
});

await navigateTo(`/${firstGame.value}`, { replace: true });
</script>
