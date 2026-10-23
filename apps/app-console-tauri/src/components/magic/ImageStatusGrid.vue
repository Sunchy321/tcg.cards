<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
        <!-- No bg-white class: the dark-mode bg-white remap is !important and would defeat the inline color. -->
        <span class="size-3 shrink-0 rounded-[3px] border border-slate-300" :style="item.swatch" />
        {{ item.label }}
      </span>
    </div>

    <div
      class="max-h-104 overflow-auto rounded-lg border border-slate-200 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
      @mouseover="onHover"
      @mouseout="onLeave"
      @click="onClick"
      @scroll="tip = null"
    >
      <div class="grid w-max" :style="gridStyle">
        <div class="sticky left-0 top-0 z-20 bg-white" />
        <div
          v-for="(number, col) in grid.numbers"
          :key="`header-${number}`"
          class="sticky top-0 z-10 whitespace-nowrap bg-white text-right font-mono text-[10px] leading-4 text-muted"
        >
          {{ col % headerLabelEvery === 0 ? number : '' }}
        </div>

        <template v-for="(row, rowIndex) in matrix" :key="row.lang">
          <div class="sticky left-0 z-10 bg-white pr-1 font-mono text-[10px] leading-4 text-muted">
            {{ row.lang.toUpperCase() }}
          </div>
          <div
            v-for="(cell, colIndex) in row.cells"
            :key="`${row.lang}-${cell.number}`"
            class="rounded-[2px]"
            :class="cell.blank ? '' : 'cursor-pointer hover:brightness-75'"
            :style="cell.style"
            :data-cell="cell.blank ? undefined : `${rowIndex},${colIndex}`"
          />
        </template>
      </div>
    </div>

    <div
      v-if="tip"
      class="pointer-events-none fixed z-50 max-w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
      :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
    >
      <div class="mb-1 font-mono text-sm">{{ tip.view.number }} · {{ tip.view.lang.toUpperCase() }}</div>
      <p v-if="tip.view.state === 'gap'">该语言没有此编号。</p>
      <p v-else-if="tip.view.state === 'missing'">未导入。</p>
      <p v-else-if="tip.view.state === 'placeholder'">已标记无图，不会被远程导入覆盖。</p>
      <template v-else>
        <div v-for="(face, index) in tip.view.faces" :key="index">
          {{ faceLabel(index) }} ·
          <template v-if="face">
            {{ sourceLabel(face.source) }} · {{ face.width }}×{{ face.height }} · {{ formatBytes(face.byteSize) }}<span v-if="face.status === 'lowres'" class="text-warning"> · 低清</span>
          </template>
          <template v-else>未导入</template>
        </div>
      </template>
      <p v-if="tip.view.small" class="mt-1 text-error">尺寸偏小。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/** One imported face of a grid cell, as reported by the runtime. */
interface GridFace {
  source:   string;
  status:   string;
  width:    number;
  height:   number;
  byteSize: number;
}

/** One (lang, number) print of the checked set, merged across version rows. */
interface GridCell {
  lang:   string;
  number: string;
  state:  'imported' | 'missing' | 'placeholder';
  faces:  Array<GridFace | null>;
}

/** Status-grid axes and cells of one quality report. */
interface QualityGrid {
  langs:   string[];
  numbers: string[];
  cells:   GridCell[];
}

/** Set-wide quality report parts the grid reads: axes, cells, and undersized prints. */
interface QualityReport {
  grid:     QualityGrid;
  problems: Array<{ lang: string, number: string }>;
}

/** Render-ready slot of the matrix: background style plus tooltip data. */
interface CellView {
  lang:   string;
  number: string;
  blank:  boolean;
  state:  'gap' | 'imported' | 'missing' | 'placeholder';
  small:  boolean;
  faces:  Array<GridFace | null>;
  style:  string;
}

/** One language row of the matrix. */
interface RowView {
  lang:  string;
  cells: CellView[];
}

/** One legend swatch. */
interface LegendItem {
  label:  string;
  swatch: string;
}

const props = defineProps<{ report: QualityReport }>();

const emit = defineEmits<{ select: [{ lang: string, number: string }] }>();

/** Source keys in legend order; every known key maps to a user-facing label. */
const SOURCE_LABELS: Record<string, string> = {
  scryfall: 'Scryfall',
  gatherer: 'Gatherer',
  mtgch:    'MTGCH',
  mtgflame: 'MTGFlame',
  hunterer: 'Hunterer',
  manual:   '手动上传',
};

/** Source → swatch color; sources outside the known set fall back to a neutral slate. */
const SOURCE_COLORS: Record<string, string> = {
  scryfall: '#3b82f6',
  gatherer: '#10b981',
  mtgch:    '#f59e0b',
  mtgflame: '#ef4444',
  hunterer: '#8b5cf6',
  manual:   '#ec4899',
};

const UNKNOWN_SOURCE_COLOR = '#64748b';
const MISSING_COLOR = '#cbd5e1';
const PLACEHOLDER_BACKGROUND = 'repeating-linear-gradient(135deg, #cbd5e1 0 3px, #94a3b8 3px 6px)';
const SMALL_RING = 'inset 0 0 0 2px #dc2626';

/** Number columns between two header labels; four 16px pitches leave room for every label text. */
const headerLabelEvery = 4;

const grid = computed(() => props.report.grid);

/** Grid cells keyed by `lang/number`, so matrix building stays one lookup per slot. */
const cellMap = computed(() => {
  const map = new Map<string, GridCell>();
  for (const cell of grid.value.cells) map.set(`${cell.lang}/${cell.number}`, cell);
  return map;
});

/** (lang, number) pairs the quality check flagged as undersized. */
const smallKeys = computed(() => {
  const keys = new Set<string>();
  for (const problem of props.report.problems) keys.add(`${problem.lang}/${problem.number}`);
  return keys;
});

/** Grid track layout: one label column, one 14px column per collector number, 16px rows. */
const gridStyle = computed(() => ({
  gridTemplateColumns: `3rem repeat(${grid.value.numbers.length}, 14px)`,
  gridAutoRows:        '16px',
  gap:                 '2px',
}));

/** Full language × number matrix; slots without a print stay blank so columns keep alignment. */
const matrix = computed<RowView[]>(() =>
  grid.value.langs.map(lang => ({
    lang,
    cells: grid.value.numbers.map(number => {
      const cell = cellMap.value.get(`${lang}/${number}`);
      if (cell == null) {
        return { lang, number, blank: true, state: 'gap' as const, small: false, faces: [], style: '' };
      }
      const background = cell.state === 'missing'
        ? MISSING_COLOR
        : cell.state === 'placeholder'
          ? PLACEHOLDER_BACKGROUND
          : faceBackground(cell.faces);
      const small = smallKeys.value.has(`${lang}/${number}`);
      return {
        lang,
        number,
        blank: false,
        state: cell.state,
        small,
        faces: cell.faces,
        // Inline styles bind as CSS declarations, so the color value needs its property name.
        style: small ? `background: ${background}; box-shadow: ${SMALL_RING}` : `background: ${background}`,
      };
    }),
  })),
);

/** Legend entries: sources present in the grid first, then the special states that occur. */
const legend = computed<LegendItem[]>(() => {
  const present = new Set<string>();
  let missing = false;
  let placeholder = false;
  for (const cell of grid.value.cells) {
    if (cell.state === 'missing') missing = true;
    else if (cell.state === 'placeholder') placeholder = true;
    for (const face of cell.faces) if (face != null) present.add(face.source);
  }
  const hasGap = grid.value.cells.length < grid.value.langs.length * grid.value.numbers.length;

  const items: LegendItem[] = Object.keys(SOURCE_LABELS)
    .filter(source => present.has(source))
    .map(source => ({ label: SOURCE_LABELS[source]!, swatch: `background: ${SOURCE_COLORS[source]}` }));
  for (const source of [...present].sort()) {
    if (SOURCE_LABELS[source] != null) continue;
    items.push({ label: source, swatch: `background: ${UNKNOWN_SOURCE_COLOR}` });
  }
  if (missing) items.push({ label: '未导入', swatch: `background: ${MISSING_COLOR}` });
  if (placeholder) items.push({ label: '已标记无图', swatch: `background: ${PLACEHOLDER_BACKGROUND}` });
  if (hasGap) items.push({ label: '缺位（该语言无此编号）', swatch: 'background: transparent; border-style: dashed' });
  if (props.report.problems.length > 0) {
    items.push({ label: '尺寸偏小', swatch: `background: ${SOURCE_COLORS.scryfall}; box-shadow: ${SMALL_RING}` });
  }
  return items;
});

/** The shared hover card; one element serves every cell, so cells stay plain divs. */
const tip = ref<{ x: number, y: number, view: CellView } | null>(null);

/** Anchors the hover card next to the cursor, clamped so it never leaves the viewport. */
function onHover(event: MouseEvent) {
  const view = cellFromEvent(event);
  if (view == null) return;
  const width = 280;
  const height = 170;
  const x = Math.min(event.clientX + 14, window.innerWidth - width - 8);
  const y = event.clientY + 18 + height > window.innerHeight
    ? Math.max(8, event.clientY - height - 12)
    : event.clientY + 18;
  tip.value = { x, y, view };
}

/** Hides the hover card only when the cursor moves off the cells (into another cell re-anchors it). */
function onLeave(event: MouseEvent) {
  const to = event.relatedTarget as HTMLElement | null;
  if (to?.closest('[data-cell]') != null) return;
  tip.value = null;
}

/** Emits the hovered print selection; blank gaps carry no print to select. */
function onClick(event: MouseEvent) {
  const view = cellFromEvent(event);
  if (view == null || view.blank) return;
  emit('select', { lang: view.lang, number: view.number });
}

/** Resolves the event target to its matrix slot, if it hit a cell at all. */
function cellFromEvent(event: Event): CellView | null {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
  if (target == null) return null;
  const [rowIndex, colIndex] = (target.dataset.cell ?? '').split(',').map(Number);
  return matrix.value[rowIndex!]?.cells[colIndex!] ?? null;
}

/** Background of an imported cell: one face fills the cell, several faces split it into equal vertical stripes. */
function faceBackground(faces: Array<GridFace | null>): string {
  const colors = faces.map(face => face == null ? MISSING_COLOR : SOURCE_COLORS[face.source] ?? UNKNOWN_SOURCE_COLOR);
  if (colors.length <= 1) return colors[0] ?? MISSING_COLOR;
  const step = 100 / colors.length;
  const stops = colors.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Face index in user language; 0 and 1 are the common front/back pair. */
function faceLabel(index: number): string {
  if (index === 0) return '正面';
  if (index === 1) return '背面';
  return `面 ${index}`;
}

/** Source key in user language; unknown keys show verbatim. */
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Byte count in compact binary units, matching the compare panel's format. */
function formatBytes(size: number): string {
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}
</script>
