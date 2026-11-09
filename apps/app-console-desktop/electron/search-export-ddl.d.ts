declare module 'virtual:desktop-search-export-ddl' {
  const ddl: Record<'magic' | 'hearthstone', string>;
  export const magicFtsSql: string;
  export default ddl;
}
