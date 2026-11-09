import { describe, expect, test } from 'bun:test';

import { decodeLinkMarkers } from './link-markers';

describe('decodeLinkMarkers', () => {
  test('decodes the site artwork-verified combinations', () => {
    // Decode Talker (top + bottom-left + bottom-right) and Accesscode Talker
    // (the full cross); both verified against link_pc/link{code}.png.
    expect(decodeLinkMarkers('813')).toEqual(['top', 'bottom-left', 'bottom-right']);
    expect(decodeLinkMarkers('8462')).toEqual(['top', 'left', 'right', 'bottom']);
  });

  test('decodes every single-marker position', () => {
    expect(decodeLinkMarkers('1')).toEqual(['bottom-left']);
    expect(decodeLinkMarkers('2')).toEqual(['bottom']);
    expect(decodeLinkMarkers('3')).toEqual(['bottom-right']);
    expect(decodeLinkMarkers('4')).toEqual(['left']);
    expect(decodeLinkMarkers('6')).toEqual(['right']);
    expect(decodeLinkMarkers('7')).toEqual(['top-left']);
    expect(decodeLinkMarkers('8')).toEqual(['top']);
    expect(decodeLinkMarkers('9')).toEqual(['top-right']);
  });

  test('treats empty, null, and unknown digits leniently', () => {
    expect(decodeLinkMarkers(null)).toEqual([]);
    expect(decodeLinkMarkers('')).toEqual([]);
    expect(decodeLinkMarkers('5')).toEqual([]); // 5 = the card itself, never a marker
    expect(decodeLinkMarkers('1x2')).toEqual(['bottom-left', 'bottom']);
  });
});
