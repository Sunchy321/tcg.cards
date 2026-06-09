import { customType } from 'drizzle-orm/pg-core';

export function vector() {
  return customType<{
    data:       number[];
    driverData: string;
    config:     { dimensions?: number };
  }>({
    dataType(config) {
      const dimensions = config?.dimensions ?? 1024;
      return `vector(${dimensions})`;
    },

    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },

    fromDriver(value: string): number[] {
      const text = value.trim();

      if (text.length <= 2) {
        return [];
      }

      return text
        .slice(1, -1)
        .split(',')
        .map(Number);
    },
  });
}
