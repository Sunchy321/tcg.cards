/** Parses a --key=value argument from process.argv. */
export function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

/** Parses all --key=value arguments from process.argv. */
export function parseArgs(prefix: string): string[] {
  return process.argv
    .filter(a => a.startsWith(prefix))
    .map(a => a.slice(prefix.length));
}

/** Returns true when --dry-run is present in process.argv. */
export function isDryRun(): boolean {
  return process.argv.includes('--dry-run');
}
