export function changeTypeClass(type: string): string {
  const map: Record<string, string> = {
    card_change:  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    card_update:  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    set_change:   'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    rule_change:  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    format_birth: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    format_death: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return map[type] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

export function changeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    card_change:  'Legality',
    card_update:  'Card Update',
    set_change:   'Set',
    rule_change:  'Rule',
    format_birth: 'Format Birth',
    format_death: 'Format Death',
  };
  return labels[type] ?? type;
}
