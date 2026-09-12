import { describe, expect, test } from 'bun:test';

import { emptyRemoteSkipped, gathererQueueRow, gathererRowUrls, scryfallQueueRow, scryfallRowUrls } from './source';
import type { GathererImageRow, ScryfallImageRow } from './source';

const topLevelPng = 'https://cards.scryfall.io/png/front/a/b/ab.png';
const frontPng = 'https://cards.scryfall.io/png/front/c/d/cd.png';
const backPng = 'https://cards.scryfall.io/png/back/c/d/cd.png';

const frontGathererUrl = 'https://gatherer-static.wizards.com/Cards/medium/front.png';
const backGathererUrl = 'https://gatherer-static.wizards.com/Cards/medium/back.png';
const frontGatherer = { default: frontGathererUrl };
const backGatherer = { default: backGathererUrl };

const baseRow = {
  cardId:       'card',
  version:      '',
  set:          'tst',
  number:       '1',
  lang:         'en',
  source:       '',
  layout:       'normal',
  scryfallFace: null,
  imageInfo:    null,
};

function scryfallRow(overrides: Partial<ScryfallImageRow>): ScryfallImageRow {
  return {
    ...baseRow,
    scryfallImageStatus: 'highres_scan',
    scryfallImageUris:   null,
    scryfallCardFaces:   [],
    ...overrides,
  };
}

function gathererRow(overrides: Partial<GathererImageRow>): GathererImageRow {
  return { ...baseRow, multiverseId: [1], gathererData: null, ...overrides };
}

describe('scryfallRowUrls', () => {
  // Adventure, split, flip and prepare cards have two parts but one printed
  // image: scryfall serves it at the top level and leaves the faces without uris.
  test('uses the top-level image for a one-image card with several parts', () => {
    const row = {
      layout:            'adventure',
      scryfallFace:      null,
      scryfallImageUris: { png: topLevelPng },
      scryfallCardFaces: [{ image_uris: undefined }, { image_uris: undefined }],
    };
    expect(scryfallRowUrls(row)).toEqual([topLevelPng]);
  });

  test('uses the per-face images of a front/back card', () => {
    const row = {
      layout:            'transform',
      scryfallFace:      null,
      scryfallImageUris: null,
      scryfallCardFaces: [{ image_uris: { png: frontPng } }, { image_uris: { png: backPng } }],
    };
    expect(scryfallRowUrls(row)).toEqual([frontPng, backPng]);
  });
});

describe('scryfallQueueRow', () => {
  test('queues one face of a one-image card and allows no second slot', () => {
    const queued = scryfallQueueRow(scryfallRow({
      layout:            'adventure',
      scryfallImageUris: { png: topLevelPng },
      scryfallCardFaces: [{ image_uris: undefined }, { image_uris: undefined }],
    }), emptyRemoteSkipped());
    expect(queued?.faces).toEqual([{ faceIndex: 0, url: topLevelPng }]);
    expect(queued?.faceCount).toBe(1);
  });

  test('queues both faces of a front/back card', () => {
    const queued = scryfallQueueRow(scryfallRow({
      layout:            'transform',
      scryfallCardFaces: [{ image_uris: { png: frontPng } }, { image_uris: { png: backPng } }],
    }), emptyRemoteSkipped());
    expect(queued?.faces.map(face => face.url)).toEqual([frontPng, backPng]);
    expect(queued?.faceCount).toBe(2);
  });

  // A card whose parts share one printed image may still expose per-face uris
  // (double-faced token units); the layout cap keeps it to the front face.
  test('caps a one-image layout at its first face', () => {
    const queued = scryfallQueueRow(scryfallRow({
      layout:            'token',
      scryfallCardFaces: [{ image_uris: { png: frontPng } }, { image_uris: { png: backPng } }],
    }), emptyRemoteSkipped());
    expect(queued?.faces.map(face => face.faceIndex)).toEqual([0]);
    expect(queued?.faceCount).toBe(1);
  });

  test('keeps only the pinned face of a row pinned to one face', () => {
    const queued = scryfallQueueRow(scryfallRow({
      layout:            'reversible_card',
      scryfallFace:      'back',
      scryfallCardFaces: [{ image_uris: { png: frontPng } }, { image_uris: { png: backPng } }],
    }), emptyRemoteSkipped());
    expect(queued?.faces).toEqual([{ faceIndex: 1, url: backPng }]);
    expect(queued?.faceCount).toBe(2);
  });
});

describe('gathererRowUrls', () => {
  // Gatherer repeats the front image in `compositeCard` for cards whose parts
  // share one printed image, so only front/back layouts may read it.
  test('ignores the composite card of a one-image layout', () => {
    const row = {
      layout:       'adventure',
      scryfallFace: null,
      gathererData: { imageUrls: frontGatherer, compositeCard: { imageUrls: backGatherer } },
    };
    expect(gathererRowUrls(row)).toEqual([frontGathererUrl]);
  });

  test('reads the composite card of a front/back layout', () => {
    const row = {
      layout:       'modal_dfc',
      scryfallFace: null,
      gathererData: { imageUrls: frontGatherer, compositeCard: { imageUrls: backGatherer } },
    };
    expect(gathererRowUrls(row)).toEqual([frontGathererUrl, backGathererUrl]);
  });
});

describe('gathererQueueRow', () => {
  test('queues one face of a one-image card that carries a composite image', () => {
    const queued = gathererQueueRow(gathererRow({
      layout:       'adventure',
      gathererData: { imageUrls: frontGatherer, compositeCard: { imageUrls: backGatherer } },
    }), emptyRemoteSkipped());
    expect(queued?.faces).toEqual([{ faceIndex: 0, url: frontGathererUrl }]);
    expect(queued?.faceCount).toBe(1);
  });

  test('queues both faces of a front/back card', () => {
    const queued = gathererQueueRow(gathererRow({
      layout:       'modal_dfc',
      gathererData: { imageUrls: frontGatherer, compositeCard: { imageUrls: backGatherer } },
    }), emptyRemoteSkipped());
    expect(queued?.faces.map(face => face.url)).toEqual([frontGathererUrl, backGathererUrl]);
    expect(queued?.faceCount).toBe(2);
  });
});
