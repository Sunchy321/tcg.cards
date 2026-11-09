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

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />

    <div v-if="!loading && items.length === 0" class="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">
      暂无待评审项。
    </div>

    <div v-else class="flex items-start gap-4">
      <!-- pending list (narrow) -->
      <div class="w-1/6 shrink-0 min-w-0 space-y-2">
        <button
          v-for="(item, idx) in items"
          :key="item.id"
          class="w-full rounded-lg border px-2 py-2 text-left transition"
          :class="idx === selectedIndex ? 'border-primary bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
          @click="select(idx)"
        >
          <div class="flex items-center gap-1.5">
            <span v-if="item.slug" class="min-w-0 truncate font-mono text-sm font-semibold">{{ item.slug }}</span>
            <span v-else class="min-w-0 truncate text-xs">{{ kindLabel(item.kind) }}</span>
          </div>
          <div v-if="item.kind === 'slug_conflict' && item.members" class="text-xs text-muted">{{ item.members.length }} 张</div>
        </button>
      </div>

      <!-- detail (extends to the far right) -->
      <div class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4">
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
                <UButton label="快速添加后缀" icon="i-lucide-wand-2" color="neutral" variant="soft" size="sm" :disabled="suffixing" @click="quickSuffix" />
                <UButton label="提交解决" icon="i-lucide-check" color="primary" size="sm" :loading="submitting" @click="resolve" />
              </div>
            </div>

            <div v-if="needCanonical && current.members.length > 1" class="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <div class="text-xs text-muted">合并的成员数据不一致，请选择以哪个成员的内容为准：</div>
              <button
                v-for="m in current.members"
                :key="m.key"
                class="flex w-full items-start gap-2 rounded-lg border p-2 text-left"
                :class="canonicalOf(current.id) === m.key ? 'border-primary bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
                @click="setCanonical(current.id, m.key)"
              >
                <UIcon
                  :name="canonicalOf(current.id) === m.key ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  class="mt-0.5 size-4 shrink-0"
                  :class="canonicalOf(current.id) === m.key ? 'text-primary' : 'text-slate-300'"
                />
                <div class="min-w-0">
                  <div class="truncate font-medium">{{ memberCards[m.key]?.name ?? m.name ?? m.key }}</div>
                  <div v-if="memberCards[m.key]" class="truncate text-xs text-muted">{{ memberCards[m.key]!.set }} {{ memberCards[m.key]!.number }} · {{ memberCards[m.key]!.typeLine }}</div>
                  <div v-if="memberCards[m.key]" class="truncate text-xs text-slate-400">{{ (memberCards[m.key]!.oracleText ?? '').slice(0, 90) }}</div>
                </div>
              </button>
            </div>

            <div v-if="memberCard" class="mt-4 space-y-3">
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="slugValue(current.id, currentMember!.key)"
                  class="w-full max-w-xl font-mono"
                  placeholder="目标 slug"
                  autocapitalize="off"
                  autocomplete="off"
                  spellcheck="false"
                  @update:model-value="setSlug(current.id, currentMember!.key, $event)"
                />
                <UButton
                  label="标准化"
                  icon="i-lucide-sparkles"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  @click="normalizeSlug(current.id, currentMember!.key)"
                />
              </div>
              <div class="text-lg font-semibold">{{ memberCard.name }}</div>
              <div class="text-sm text-muted">{{ memberCard.typeLine }} — {{ memberCard.manaCost }}</div>
              <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap">{{ memberCard.oracleText || '—' }}</div>
              <div class="grid grid-cols-4 gap-2 text-sm">
                <div>力量 {{ memberCard.power ?? '—' }}</div>
                <div>防御 {{ memberCard.toughness ?? '—' }}</div>
                <div>系列/序号 {{ memberCard.set }} {{ memberCard.number }}</div>
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
import { slugifySlugInput } from '@tcg-cards/shared/magic/slug';

definePageMeta({ layout: 'admin', title: '评审' });

interface ReviewMember { key: string, name: string | null }
interface ReviewItem {
  id: string; kind: string; subject: Record<string, unknown>; payload: Record<string, unknown>;
  slug?: string; reason?: string; members?: ReviewMember[];
}
interface MemberCard { oracleId: string, name: string, typeLine: string | null, oracleText: string | null, manaCost: string | null, colors: string[] | null, power: string | null, toughness: string | null, set: string, number: string }

const loading = ref(false);
const submitting = ref(false);
const suffixing = ref(false);
const error = ref('');
const needCanonical = ref(false);
const needCanonicalSlugs = ref<string[]>([]);
const items = ref<ReviewItem[]>([]);
const selectedIndex = ref(-1);
const memberIndex = ref(0);
const memberCard = ref<MemberCard | null>(null);
const memberCards = reactive<Record<string, MemberCard>>({});
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

/** Characters that may appear in a stored slug as typed (lowercase, digits, !, _, -). */
const SLUG_INPUT_SAFE = /^[a-z0-9!_-]*$/;

function setSlug(reviewId: string, key: string, value: string) {
  // Auto-normalize only when the input contains characters that can never be
  // part of a slug (uppercase, spaces, punctuation, diacritics…). Input made of
  // slug-safe characters stays as typed; the manual normalize button handles
  // the rest, e.g. trimming stray leading/trailing dashes.
  slugs[`${reviewId}:${key}`] = SLUG_INPUT_SAFE.test(value) ? value : slugifySlugInput(value);
}

function normalizeSlug(reviewId: string, key: string) {
  slugs[`${reviewId}:${key}`] = slugifySlugInput(slugValue(reviewId, key));
}

// Content source (canonical) choice when several members are merged to a slug.
const canonicalUnit = reactive<Record<string, string>>({});
function canonicalOf(reviewId: string): string {
  return canonicalUnit[reviewId] ?? current.value?.members?.[0]?.key ?? '';
}
function setCanonical(reviewId: string, unit: string) {
  canonicalUnit[reviewId] = unit;
}

async function load() {
  loading.value = true;
  try {
    const res = await orpc.magic.review.list({});
    items.value = res.items;
    if (selectedIndex.value >= items.value.length) selectedIndex.value = -1;
    memberCard.value = null;
    // After a resolution the pending list shifts; auto-load the next item if
    // it is a slug conflict (otherwise the detail would stay on "加载中").
    const cur = current.value;
    if (cur?.kind === 'slug_conflict' && cur.members && cur.members.length > 0) {
      memberIndex.value = 0;
      void loadMember();
    }
  } finally {
    loading.value = false;
  }
}

function select(idx: number) {
  error.value = '';
  needCanonical.value = false;
  needCanonicalSlugs.value = [];
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
  memberCard.value = await orpc.magic.slug.member({ unit: m.key });
}

/** Load every member's card so the canonical picker can tell them apart. */
async function loadAllMembers() {
  const item = current.value;
  if (!item?.members) return;
  for (const m of item.members) {
    if (!memberCards[m.key]) {
      try {
        memberCards[m.key] = await orpc.magic.slug.member({ unit: m.key });
      } catch {
        // keep name fallback if a member cannot be resolved
      }
    }
  }
}

/** Fill each member's target slug from its own collector-number letter suffix. */
async function quickSuffix() {
  const item = current.value;
  if (!item || !item.members) return;
  suffixing.value = true;
  try {
    for (const m of item.members) {
      const card = await orpc.magic.slug.member({ unit: m.key });
      const tail = card.number.match(/[A-Za-z]+$/);
      const letter = tail ? tail[0].toLowerCase() : '';
      setSlug(item.id, m.key, letter ? `${item.slug}-${letter}` : '');
    }
  } finally {
    suffixing.value = false;
  }
}

async function resolve() {
  const item = current.value;
  if (!item || !item.members) return;
  error.value = '';
  submitting.value = true;
  try {
    const assignments = item.members.map(m => ({
      unit: m.key,
      slug: (slugs[`${item.id}:${m.key}`] ?? '').trim() || item.slug!,
    }));

    // Only when the backend flagged merged members that disagree do we need to
    // send a content source (canonical); otherwise no canonical is stored.
    const groups = new Map<string, string[]>();
    for (const a of assignments) {
      const list = groups.get(a.slug) ?? [];
      if (!list.includes(a.unit)) list.push(a.unit);
      groups.set(a.slug, list);
    }

    const payload: { reviewId: string, assignments: typeof assignments, canonical?: { slug: string, unit: string }[] } = {
      reviewId: item.id,
      assignments,
    };
    if (needCanonical.value) {
      const chosen = canonicalUnit[item.id];
      if (!chosen || needCanonicalSlugs.value.some(slug => !(groups.get(slug) ?? []).includes(chosen))) {
        error.value = '请先在上方选择“内容来源”。';
        return;
      }
      payload.canonical = needCanonicalSlugs.value.map(slug => ({ slug, unit: chosen }));
    }

    await orpc.magic.slug.resolveConflict(payload);
    needCanonical.value = false;
    needCanonicalSlugs.value = [];
    await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('canonical')) {
      const m = msg.match(/canonical）：(.+?) ｜ 详情/);
      needCanonical.value = true;
      needCanonicalSlugs.value = m ? m[1].split('、').map(s => s.trim()) : [];
      void loadAllMembers();
    }
    error.value = msg;
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
