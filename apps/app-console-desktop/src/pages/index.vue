<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { getAccessibleGames } from '@tcg-cards/console-core';
import { currentAuthState } from '../auth';

const router = useRouter();
const role = computed(() => currentAuthState.value?.user.role ?? null);
const games = computed(() => getAccessibleGames(role.value));
const target = computed(() => games.value[0] ? `/${games.value[0]}` : '/settings');

router.replace(target.value);
</script>
