<template>
  <div class="mt-6">
    <p class="mb-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">{{ $t('reference.tryIt') }}</p>

    <div v-if="endpoint.resource === 'catalog'" class="overflow-hidden rounded-lg border border-default">
      <div class="flex items-center gap-2 bg-muted/50 px-3 py-2.5">
        <UBadge color="success" variant="subtle" class="font-mono text-xs">{{ $t('tryIt.public') }}</UBadge>
        <UBadge color="neutral" variant="outline" class="font-mono text-xs">{{ endpoint.method }}</UBadge>
        <code class="min-w-0 flex-1 break-all font-mono text-sm text-highlighted">{{ apiUrl }}</code>
        <UButton color="primary" size="sm" :loading="loading" @click="run">
          {{ $t('tryIt.run') }}
        </UButton>
      </div>

      <pre v-if="response" class="max-h-80 overflow-auto border-t border-default bg-muted/30 px-3 py-3 font-mono text-sm text-highlighted">{{ response }}</pre>
      <pre v-if="error" class="max-h-80 overflow-auto border-t border-default bg-red-500/10 px-3 py-3 font-mono text-sm text-red-400">{{ error }}</pre>
    </div>

    <div v-else class="rounded-lg border border-dashed border-default px-4 py-5 text-center">
      <p class="text-sm text-muted">{{ $t('tryIt.requiresKey') }}</p>
      <p class="mt-1 text-xs text-dimmed">{{ $t('tryIt.requiresKeyHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EndpointDoc } from '../../lib/registry-docs';

const props = defineProps<{
  endpoint: EndpointDoc;
}>();

const runtimeConfig = useRuntimeConfig();
const apiBase = runtimeConfig.public.apiBaseUrl;

const apiUrl = computed(() => `/v1/${props.endpoint.path.join('/')}`);
const loading = ref(false);
const response = ref<string | null>(null);
const error = ref<string | null>(null);

async function run() {
  loading.value = true;
  response.value = null;
  error.value = null;

  try {
    const res = await fetch(`${apiBase}${apiUrl.value}`, { headers: { accept: 'application/json' } });
    const body = await res.text();

    if (res.ok) {
      response.value = formatBody(body);
    } else {
      error.value = `${res.status} ${body}`;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
</script>
