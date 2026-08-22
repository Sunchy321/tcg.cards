<template>
  <div class="mt-6">
    <p class="mb-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">{{ $t('reference.tryIt') }}</p>

    <!-- Public catalog endpoint -->
    <div v-if="endpoint.resource === 'catalog'" class="overflow-hidden rounded-lg border border-default">
      <div class="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2.5">
        <UBadge color="success" variant="subtle" class="font-mono text-xs">{{ $t('tryIt.public') }}</UBadge>
        <UBadge color="neutral" variant="outline" class="font-mono text-xs">{{ endpoint.method }}</UBadge>
        <code class="min-w-0 flex-1 break-all font-mono text-sm text-highlighted">{{ apiUrl }}</code>
        <UButton icon="i-lucide-terminal" color="neutral" variant="ghost" size="sm" :aria-label="$t('tryIt.copyCurl')" @click="copyCurl">
          curl
        </UButton>
        <UButton color="primary" size="sm" :loading="loading" @click="run">
          {{ $t('tryIt.run') }}
        </UButton>
      </div>

      <div v-if="status" class="flex items-center gap-2 border-t border-default bg-muted/30 px-3 py-2 text-xs font-mono">
        <UBadge :color="statusOk ? 'success' : 'error'" variant="subtle" class="font-mono">{{ status }}</UBadge>
        <span class="text-muted">{{ statusText }}</span>
        <span v-if="duration !== null" class="ml-auto text-muted">{{ duration }}ms</span>
      </div>

      <pre v-if="response" class="max-h-80 overflow-auto border-t border-default bg-muted/30 px-3 py-3 font-mono text-sm text-highlighted">{{ response }}</pre>
      <pre v-if="error" class="max-h-80 overflow-auto border-t border-default bg-red-500/10 px-3 py-3 font-mono text-sm text-red-400">{{ error }}</pre>
    </div>

    <!-- Keyed endpoint -->
    <div v-else class="overflow-hidden rounded-lg border border-default">
      <div class="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2.5">
        <UBadge color="primary" variant="outline" class="font-mono text-xs">{{ endpoint.method }}</UBadge>
        <code class="min-w-0 flex-1 break-all font-mono text-sm text-highlighted">{{ apiUrl }}</code>
        <template v-if="apiKey">
          <span class="font-mono text-xs text-muted">{{ maskApiKey(apiKey) }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="$t('tryIt.clearKey')" @click="clearApiKey" />
        </template>
        <UInput
          v-else
          v-model="keyInput"
          type="password"
          :placeholder="$t('tryIt.keyPlaceholder')"
          size="sm"
          class="w-40"
          autocomplete="off"
          @keydown.enter="useEnteredKey"
          @keydown.cut.prevent
          @keydown.copy.prevent
          @dragstart.prevent
          @selectstart.prevent
          @contextmenu.prevent
        />
        <UButton
          v-if="!apiKey && session.data"
          color="primary"
          variant="soft"
          size="sm"
          icon="i-lucide-plus"
          @click="openCreateDialog"
        >
          {{ $t('tryIt.createKey') }}
        </UButton>
        <UButton icon="i-lucide-terminal" color="neutral" variant="ghost" size="sm" :aria-label="$t('tryIt.copyCurl')" @click="copyCurl">
          curl
        </UButton>
        <UButton color="primary" size="sm" :loading="loading" @click="run">
          {{ $t('tryIt.run') }}
        </UButton>
      </div>

      <!-- Query parameters -->
      <div v-if="paramFields.length > 0" class="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2.5">
        <span class="text-xs font-semibold tracking-wide text-muted uppercase">{{ $t('tryIt.params') }}</span>
        <template v-for="field in paramFields" :key="field.key">
          <USelect
            v-if="field.schema.kind === 'enum'"
            v-model="paramValues[field.key]"
            :items="field.schema.values ?? []"
            size="sm"
            class="w-36"
          />
          <UInput
            v-else
            v-model="paramValues[field.key]"
            :type="field.schema.kind === 'number' ? 'number' : 'text'"
            size="sm"
            class="w-36"
            :placeholder="field.key"
          />
        </template>
      </div>

      <div v-if="status" class="flex items-center gap-2 border-t border-default bg-muted/30 px-3 py-2 text-xs font-mono">
        <UBadge :color="statusOk ? 'success' : 'error'" variant="subtle" class="font-mono">{{ status }}</UBadge>
        <span class="text-muted">{{ statusText }}</span>
        <span v-if="duration !== null" class="ml-auto text-muted">{{ duration }}ms</span>
      </div>

      <pre v-if="response" class="max-h-80 overflow-auto border-t border-default bg-muted/30 px-3 py-3 font-mono text-sm text-highlighted">{{ response }}</pre>
      <pre v-if="error" class="max-h-80 overflow-auto border-t border-default bg-red-500/10 px-3 py-3 font-mono text-sm text-red-400">{{ error }}</pre>
    </div>

    <ApiKeyCreateDialog v-model:open="showCreateDialog" @created="useCreatedKey" />
  </div>
</template>

<script setup lang="ts">
import type { EndpointDoc } from '../../lib/registry-docs';
import { authClient } from '../composables/auth';
import { useApiKey } from '../composables/use-api-key';

const props = defineProps<{
  endpoint: EndpointDoc;
}>();

const { t } = useI18n();
const toast = useToast();

const runtimeConfig = useRuntimeConfig();
const apiBase = runtimeConfig.public.apiBaseUrl;

const session = authClient.useSession();
const { apiKey, setApiKey, clearApiKey, maskApiKey } = useApiKey();

/** Fields to expose as query-parameter inputs (input object schema). */
const paramFields = computed(() => {
  const input = props.endpoint.input;
  if (input.kind !== 'object') {
    return [];
  }
  return input.fields ?? [];
});

const paramValues = reactive<Record<string, string>>({});

// Initialize param values from schema defaults.
watch(paramFields, fields => {
  for (const field of fields) {
    if (paramValues[field.key] === undefined) {
      paramValues[field.key] = field.schema.defaultValue !== undefined ? String(field.schema.defaultValue) : '';
    }
  }
}, { immediate: true });

const apiUrl = computed(() => `/v1/${props.endpoint.path.join('/')}`);
const loading = ref(false);
const response = ref<string | null>(null);
const error = ref<string | null>(null);
const status = ref<number | null>(null);
const statusText = ref('');
const duration = ref<number | null>(null);

const statusOk = computed(() => status.value !== null && status.value >= 200 && status.value < 300);

const keyInput = ref('');
const showCreateDialog = ref(false);

const useEnteredKey = () => {
  if (keyInput.value) {
    setApiKey(keyInput.value.trim());
    keyInput.value = '';
  }
};

const useCreatedKey = (key: string) => {
  setApiKey(key);
};

const openCreateDialog = () => {
  showCreateDialog.value = true;
};

function buildQuery(): string {
  const parts = Object.entries(paramValues)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function authHeader(): Record<string, string> {
  // Constant (catalog) endpoints are public; never attach a key to them.
  if (props.endpoint.resource === 'catalog' || !apiKey.value) {
    return {};
  }
  return { authorization: `Bearer ${apiKey.value}` };
}

function fullUrl(): string {
  return `${apiBase}${apiUrl.value}${buildQuery()}`;
}

function buildCurl(): string {
  const method = props.endpoint.method;
  const methodArg = method === 'GET' ? '' : ` -X ${method}`;
  const parts = [`curl${methodArg} '${fullUrl()}'`];
  const headers = authHeader();
  if (headers.authorization) {
    parts.push(`  -H 'Authorization: ${headers.authorization}'`);
  }
  parts.push(`  -H 'accept: application/json'`);
  return parts.join(' \\\n');
}

const copyCurl = async () => {
  await navigator.clipboard.writeText(buildCurl());
  toast.add({ title: t('tryIt.curlCopied'), color: 'success' });
};

async function run() {
  loading.value = true;
  response.value = null;
  error.value = null;
  status.value = null;
  statusText.value = '';
  duration.value = null;

  const start = performance.now();

  const headers: Record<string, string> = { accept: 'application/json', ...authHeader() };

  try {
    const res = await fetch(fullUrl(), { headers });
    const body = await res.text();
    duration.value = Math.round(performance.now() - start);
    status.value = res.status;
    statusText.value = res.ok ? 'OK' : res.statusText;

    if (res.ok) {
      response.value = formatBody(body);
    } else {
      error.value = formatError(res.status, body);
    }
  } catch (err) {
    duration.value = Math.round(performance.now() - start);
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

/** Formats an error body: parses the service-api error JSON when present. */
function formatError(statusCode: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      const message = typeof parsed.message === 'string' ? parsed.message : '';
      return `${statusCode} ${parsed.code}${message ? ` — ${message}` : ''}`;
    }
  } catch {
    // fall through to raw body
  }
  return `${statusCode} ${body}`;
}
</script>
