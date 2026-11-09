/**
 * One-off diagnostic probe for the image-import placeholder mystery: prints
 * what the service actually read at each decision point straight to the
 * service terminal, so the service's view can be compared against direct
 * database queries. Probing never breaks the flow.
 */
export function probeImageImport(event: Record<string, unknown>): void {
  console.log('[image-probe]', JSON.stringify({ at: new Date().toISOString(), ...event }));
}
