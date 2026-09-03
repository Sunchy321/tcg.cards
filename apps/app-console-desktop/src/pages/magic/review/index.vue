<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-clipboard-list" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">评审</h1>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </div>
      <p class="mt-1 text-sm text-muted">需要人工确认的卡牌数据项：卡牌身份冲突、数据不一致、覆盖确认。</p>
    </div>

    <div v-if="!loading && items.length === 0" class="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
      暂无待评审项。
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-5">
      <!-- pending list -->
      <div class="space-y-2 xl:col-span-2">
        <button
          v-for="(item, idx) in items"
          :key="item.id"
          class="w-full rounded-lg border p-3 text-left transition"
          :class="idx === selectedIndex ? 'border-primary bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
          @click="select(idx)"
        >
          <div class="flex items-center gap-2">
            <UBadge :color="badgeColor(item.kind)">{{ kindLabel(item.kind) }}</UBadge>
            <span v-if="item.slug" class="font-mono text-sm font-semibold">{{ item.slug }}</span>
          </div>
          <div v-if="item.kind === 'slug_conflict' && item.members" class="mt-1 truncate text-xs text-muted">
            {{ item.members.map(m => m.name).join(' · ') }}
          </div>
        </button>
      </div>

      <!-- detail -->
      <div class="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-3">
        <template v-if="current">
          <!-- slug conflict: read-only card editor, slug editable, member switching -->
          <template v-if="current.kind === 'slug_conflict' && current.members">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1">
                <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" :disabled="memberIndex === 0" @click="stepMember(-1)" />
                <span class="text-sm font-semibold">{{ memberIndex + 1 }} / {{ current.members.length }}</span>
                <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" :disabled="memberIndex === current.members.length - 1" @click="stepMember(1)" />
              </div>
              <div class="ml-auto flex gap-2">
                <UButton label="提交解决" icon="i-lucide-check" color="primary" size="sm" :loading="submitting" @click="resolve" />
              </div>
            </div>

            <div v-if="memberCard" class="mt-4 space-y-3">
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="slugValue(current.id, currentMember!.key)"
                  class="w-56 font-mono"
                  placeholder="目标 slug"
                  @update:model-value="setSlug(current.id, currentMember!.key, $event)"
                />
              </div>
              <div class="text-lg font-semibold">{{ memberCard.name }}</div>
              <div class="text-sm text-muted">{{ memberCard.typeLine }} — {{ memberCard.manaCost }}</div>
              <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap">{{ memberCard.oracleText || '—' }}</div>
              <div class="grid grid-cols-4 gap-2 text-sm">
                <div>力量 {{ memberCard.power ?? '—' }}</div>
                <div>防御 {{ memberCard.toughness ?? '—' }}</div>
                <div>系列 {{ memberCard.setName }}</div>
                <div>去向 {{ slugHint }}</div>
              </div>
            </div>
            <div v-else class="mt-4 text-sm text-muted">加载成员卡…</div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-for="(m, i) in current.members"
                :key="m.key"
                class="rounded-full border px-3 py-1 text-xs"
                :class="i === memberIndex ? 'border-primary bg-primary-50 text-primary' : 'border-slate-200 text-muted hover:bg-slate-50'"
                @click="memberIndex = i; void loadMember()"
              >
                {{ m.name ?? m.key }}
              </button>
            </div>
          </template>

          <!-- other kinds: not resolvable in this UI yet -->
          <template v-else>
            <div class="flex items-center gap-2">
              <UBadge :color="badgeColor(current.kind)">{{ kindLabel(current.kind) }}</UBadge>
              <span class="ml-auto text-xs text-muted">该类型的处理尚未开放</span>
            </div>
            <p class="mt-4 text-sm text-muted">
              这一类需要人工确认的项会在后续版本提供处理入口；暂时保留待处理即可。
            </p>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '评审' });

interface ReviewMember { key: string, name: string | null }
interface ReviewItem {
  id: string; kind: string; subject: Record<string, unknown>; payload: Record<string, unknown>;
  slug?: string; reason?: string; members?: ReviewMember[];
}
interface MemberCard { oracleId: string, name: string, typeLine: string | null, oracleText: string | null, manaCost: string | null, colors: string[] | null, power: string | null, toughness: string | null, setName: string }

const loading = ref(false);
const submitting = ref(false);
const items = ref<ReviewItem[]>([]);
const selectedIndex = ref(-1);
const memberIndex = ref(0);
const memberCard = ref<MemberCard | null>(null);
const slugs = reactive<Record<string, string>>({});

const current = computed(() => (selectedIndex.value >= 0 ? items.value[selectedIndex.value] : null));
const currentMember = computed(() => current.value?.members?.[memberIndex.value]);
const slugHint = computed(() => {
  const m = currentMember.value;
  if (!m) return '';
  const s = slugs[`${current.value!.id}:${m.key}`]?.trim();
  return s ? `→ ${s}` : `保留「${current.value!.slug}」`;
});

function kindLabel(kind: string) {
  return { slug_conflict: 'slug 冲突', card_inconsistency: '数据不一致', card_field_overwrite: '字段复写' }[kind] ?? kind;
}
function badgeColor(kind: string) {
  return { slug_conflict: 'amber', card_inconsistency: 'red', card_field_overwrite: 'sky' }[kind] ?? 'neutral' as 'neutral' | 'amber' | 'red' | 'sky';
}
function slugValue(reviewId: string, key: string): string {
  return slugs[`${reviewId}:${key}`] ?? '';
}
function setSlug(reviewId: string, key: string, value: string) {
  slugs[`${reviewId}:${key}`] = value;
}

async function load() {
  loading.value = true;
  try {
    const res = await orpc.magic.review.list({});
    items.value = res.items;
    if (selectedIndex.value >= items.value.length) selectedIndex.value = -1;
    memberCard.value = null;
  } finally {
    loading.value = false;
  }
}

function select(idx: number) {
  selectedIndex.value = idx;
  memberIndex.value = 0;
  memberCard.value = null;
  if (idx >= 0 && current.value?.kind === 'slug_conflict') void loadMember();
}

function stepMember(delta: number) {
  memberIndex.value += delta;
  void loadMember();
}

async function loadMember() {
  const m = currentMember.value;
  if (!m) return;
  const oracleId = m.key.split(':')[0]!;
  memberCard.value = await orpc.magic.slug.member({ oracleId });
}

async function resolve() {
  const item = current.value;
  if (!item || !item.members) return;
  submitting.value = true;
  try {
    const assignments = item.members.map(m => ({
      oracle: m.key.split(':')[0]!,
      slug:   (slugs[`${item.id}:${m.key}`] ?? '').trim() || item.slug!,
    }));
    await orpc.magic.slug.resolveConflict({ reviewId: item.id, assignments });
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
