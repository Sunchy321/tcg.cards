/** Stable publish-generation identity for one Hearthstone publish data surface. */
export interface PublishGeneration {
  fingerprint: string;
  order: number;
}

/** Publish-generation identity for the Hearthstone `card_data` surface. */
export const publishCardDataGeneration = {
  fingerprint: 'card-data-projector/v1',
  order: 4,
} satisfies PublishGeneration;
