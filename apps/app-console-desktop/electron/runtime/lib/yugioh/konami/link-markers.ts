/**
 * Konami's link-marker encoding, shared by both official sources: Neuron puts
 * it in the arrow icon's class (`icon_img_set link813`) and the CNOCG API
 * returns it verbatim as `linkMarker`. The digits are board positions numbered
 * row by row from the bottom (1-3 bottom, 4/6 sides, 7-9 top; 5 = the card
 * itself, never used): 1=bottom-left, 2=bottom, 3=bottom-right, 4=left,
 * 6=right, 7=top-left, 8=top, 9=top-right.
 *
 * Verified against the site's own marker artwork (link_pc/link{code}.png):
 * "813" draws top + bottom-left + bottom-right (Decode Talker) and "8462"
 * draws the full cross (Accesscode Talker).
 */

/** Board position → arrow direction, per the encoding above. */
const LINK_MARKER_DIRECTIONS: Record<string, string> = {
  1: 'bottom-left',
  2: 'bottom',
  3: 'bottom-right',
  4: 'left',
  6: 'right',
  7: 'top-left',
  8: 'top',
  9: 'top-right',
};

/** One arrow direction of a link monster. */
export type LinkMarkerDirection
  = | 'bottom-left' | 'bottom' | 'bottom-right'
    | 'left' | 'right'
    | 'top-left' | 'top' | 'top-right';

/**
 * Decodes an encoding string ("813") into its arrow directions, in the order
 * the digits appear. Unknown characters are skipped so a future encoding
 * extension degrades to the directions we do understand.
 */
export function decodeLinkMarkers(code: string | null | undefined): LinkMarkerDirection[] {
  if (!code) return [];
  const directions: LinkMarkerDirection[] = [];
  for (const digit of code) {
    const direction = LINK_MARKER_DIRECTIONS[digit];
    if (direction) directions.push(direction as LinkMarkerDirection);
  }
  return directions;
}
