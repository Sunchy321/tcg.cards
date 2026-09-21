<template>
  <div class="w-full flex flex-col gap-4">
    <UCard>
      <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        {{ $t('hearthstone.dataSources.intro') }}
      </p>
    </UCard>

    <UCard v-for="section in sections" :key="section.id">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon :name="section.icon" class="size-5 text-gray-500 dark:text-gray-400" />
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ $t(`hearthstone.dataSources.sections.${section.id}.title`) }}
          </h2>
        </div>
      </template>

      <div class="flex flex-col gap-5">
        <div v-for="group in section.groups" :key="group.id" class="flex flex-col gap-3">
          <h3 v-if="group.heading" class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ $t(`hearthstone.dataSources.sections.${section.id}.groups.${group.id}.title`) }}
          </h3>

          <p
            v-for="text in group.texts"
            :key="text"
            class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
          >
            {{ $t(`hearthstone.dataSources.sections.${section.id}.groups.${group.id}.${text}`) }}
          </p>

          <ul v-if="group.sources" class="flex flex-col gap-3">
            <li v-for="source in group.sources" :key="source.id" class="flex items-start gap-3">
              <img
                v-if="source.img"
                :src="source.img"
                alt=""
                class="size-5 shrink-0 mt-0.5 rounded-sm"
                :class="source.imgClass"
              >
              <UIcon
                v-else
                :name="source.icon"
                class="size-5 shrink-0 mt-0.5 text-gray-500 dark:text-gray-400"
              />
              <p class="text-sm leading-relaxed min-w-0">
                <NuxtLink
                  v-if="source.href"
                  :to="source.href"
                  target="_blank"
                  rel="noopener"
                  class="font-medium text-primary hover:underline underline-offset-2"
                >
                  {{ $t(`hearthstone.dataSources.sources.${source.id}.name`) }}
                </NuxtLink>
                <span v-else class="font-medium text-gray-900 dark:text-white">
                  {{ $t(`hearthstone.dataSources.sources.${source.id}.name`) }}
                </span>
                <span class="text-gray-600 dark:text-gray-400">
                  — {{ $t(`hearthstone.dataSources.sources.${source.id}.desc`) }}
                </span>
              </p>
            </li>
          </ul>
        </div>

        <div v-if="section.legalLinks" class="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <NuxtLink
            v-for="doc in legalDocs"
            :key="doc.key"
            :to="doc.href"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2"
          >
            <UIcon name="i-lucide-external-link" class="size-3.5" />
            {{ $t(`hearthstone.dataSources.legal.${doc.key}`) }}
          </NuxtLink>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'main' });

const { t, locale } = useI18n();

useTitle(() => t('hearthstone.dataSources.$self'));

// A source entry shown inside a group; `img` (a public asset) takes precedence over `icon`.
interface SourceEntry {
  id:        string;
  href?:     string;
  img?:      string;
  imgClass?: string;
  icon?:     string;
}

// A titled sub-block within a section: paragraph subkeys and optional sources under groups.<id>.
interface SectionGroup {
  id:       string;
  heading?: boolean;
  texts:    string[];
  sources?: SourceEntry[];
}

// A content section of the page: an ordered list of groups plus optional legal links.
interface Section {
  id:          string;
  icon:        string;
  groups:      SectionGroup[];
  legalLinks?: boolean;
}

const sections: Section[] = [
  {
    id:     'cardData',
    icon:   'i-lucide-database',
    groups: [
      {
        id:      'cards',
        texts:   ['body'],
        sources: [
          { id: 'hsdata', img: '/hearthsim.png', href: 'https://github.com/HearthSim/hsdata' },
        ],
      },
      {
        id:      'text',
        heading: true,
        texts:   ['body'],
      },
    ],
  },
  {
    id:     'cardImages',
    icon:   'i-lucide-images',
    groups: [
      { id: 'main', texts: ['body'] },
    ],
  },
  {
    id:     'setData',
    icon:   'i-lucide-library-big',
    groups: [
      { id: 'main', texts: ['body'] },
    ],
  },
  {
    id:     'otherData',
    icon:   'i-lucide-info',
    groups: [
      {
        id:      'announcements',
        heading: true,
        texts:   ['body'],
        sources: [
          { id: 'blizzardNews', icon: 'i-lucide-megaphone', href: 'https://news.blizzard.com' },
        ],
      },
      { id: 'freshness', heading: true, texts: ['body'] },
      { id: 'attribution', heading: true, texts: ['disclaimer', 'credits'] },
    ],
    legalLinks: true,
  },
];

const repoUrl = 'https://github.com/Sunchy321/tcg.cards';

// Legal documents are bilingual markdown files in the repository; link the version matching the UI language.
const legalDocs = computed(() => {
  const suffix = locale.value === 'zhs' ? '.zh-CN' : '';
  return [
    { key: 'legal', href: `${repoUrl}/blob/master/LEGAL${suffix}.md` },
    { key: 'terms', href: `${repoUrl}/blob/master/TERMS${suffix}.md` },
    { key: 'privacy', href: `${repoUrl}/blob/master/PRIVACY${suffix}.md` },
  ];
});
</script>
