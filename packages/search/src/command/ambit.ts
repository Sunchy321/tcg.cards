import { c } from './builder';

import { ambitCommandName } from '../ambit';

/**
 * The universal `ambit:` command (ADR 0015): accepts primary/additional/full,
 * where full means no restriction. Games include this definition in their
 * command tables as-is; the value predicate lives in each game's server
 * command list against that game's ambit column.
 */
export const ambit = c
  .op([':'])
  .qual([])
  .id(ambitCommandName)
  .done();
