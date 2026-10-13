import { describe, expect, test } from 'bun:test';

import { splitNameAnnotation } from './name-annotations';

describe('splitNameAnnotation', () => {
  test('splits each localized rename annotation', () => {
    expect(splitNameAnnotation('B.E.S. Big Core (Updated from: Big Core)'))
      .toEqual({ name: 'B.E.S. Big Core', annotation: 'Updated from: Big Core' });
    expect(splitNameAnnotation('B.E.S. Großer Kern (Geändert von: Großer Kern)'))
      .toEqual({ name: 'B.E.S. Großer Kern', annotation: 'Geändert von: Großer Kern' });
    expect(splitNameAnnotation('Bouclier des Bêtes (Actualisé de : Ancien Bouclier)'))
      .toEqual({ name: 'Bouclier des Bêtes', annotation: 'Actualisé de : Ancien Bouclier' });
    expect(splitNameAnnotation('Espada Luminosa (Actualizado de: Sable Luminoso)'))
      .toEqual({ name: 'Espada Luminosa', annotation: 'Actualizado de: Sable Luminoso' });
    expect(splitNameAnnotation('Scudo Bestia (Aggiornato da: Vecchio Scudo)'))
      .toEqual({ name: 'Scudo Bestia', annotation: 'Aggiornato da: Vecchio Scudo' });
    expect(splitNameAnnotation('Forja do Draco (Atualizado de: Forja Antiga)'))
      .toEqual({ name: 'Forja do Draco', annotation: 'Atualizado de: Forja Antiga' });
  });

  test('leaves real parenthetical card names alone', () => {
    // The Recipe/Menu cycle carries parentheses as part of the name itself.
    expect(splitNameAnnotation('Concours de Cuisine (Culinary Confrontation)'))
      .toEqual({ name: 'Concours de Cuisine (Culinary Confrontation)', annotation: null });
    expect(splitNameAnnotation('Recette de Viande (Meat Recipe)'))
      .toEqual({ name: 'Recette de Viande (Meat Recipe)', annotation: null });
    expect(splitNameAnnotation('Voici la Carte (Today\'s Menu)'))
      .toEqual({ name: 'Voici la Carte (Today\'s Menu)', annotation: null });
  });

  test('leaves names without a trailing annotation alone', () => {
    expect(splitNameAnnotation('Blue-Eyes White Dragon'))
      .toEqual({ name: 'Blue-Eyes White Dragon', annotation: null });
    expect(splitNameAnnotation('(Updated from: X) Extra'))
      .toEqual({ name: '(Updated from: X) Extra', annotation: null });
  });
});
