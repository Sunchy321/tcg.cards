<template>
  <div class="space-y-4">
    <div class="grid grid-cols-4 gap-4">
      <UFormField label="来源" required>
        <USelect v-model="form.source" :items="sources" placeholder="选择来源" class="w-full" />
      </UFormField>
      <UFormField label="日期" required>
        <UInput v-model="form.date" type="date" class="w-full" />
      </UFormField>
      <UFormField label="生效日期">
        <UInput v-model="form.effectiveDate" type="date" class="w-full" />
      </UFormField>
    </div>
    <slot name="fields-extra" />
    <UFormField label="名称" required>
      <UInput v-model="form.name" placeholder="输入公告名称" />
    </UFormField>
    <UFormField label="链接">
      <div class="space-y-2">
        <div v-for="(link, index) in form.link" :key="index" class="space-y-2">
          <div class="flex gap-2">
            <UInput
              :model-value="link.url"
              placeholder="URL"
              class="flex-1"
              @update:model-value="emit('urlChange', link, String($event ?? ''))"
            />
            <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
            <slot name="link-actions" :link="link" :index="index" />
            <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="form.link.splice(index, 1)" />
          </div>
          <slot name="link-below" :link="link" :index="index" />
        </div>
        <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="form.link.push({ url: '', label: '' })" />
      </div>
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import { injectAnnouncementForm, type AnnouncementFormLinkEntry } from '~/composables/useAnnouncementForm';

defineProps<{
  sources: { label: string, value: string }[];
}>();

const emit = defineEmits<{
  urlChange: [link: AnnouncementFormLinkEntry, value: string];
}>();

const form = injectAnnouncementForm();
</script>
