import { localization as en } from './en';
import { localization as de } from './de';
import { localization as es } from './es';
import { localization as mx } from './mx';
import { localization as fr } from './fr';
import { localization as it } from './it';
import { localization as ja } from './ja';
import { localization as ko } from './ko';
import { localization as pl } from './pl';
import { localization as pt } from './pt';
import { localization as ru } from './ru';
import { localization as th } from './th';
import { localization as zhs } from './zhs';
import { localization as zht } from './zht';

import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

export const gameplayStrings: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en:  en.gameplayStrings,
  de:  de.gameplayStrings,
  es:  es.gameplayStrings,
  mx:  mx.gameplayStrings,
  fr:  fr.gameplayStrings,
  it:  it.gameplayStrings,
  ja:  ja.gameplayStrings,
  ko:  ko.gameplayStrings,
  pl:  pl.gameplayStrings,
  pt:  pt.gameplayStrings,
  ru:  ru.gameplayStrings,
  th:  th.gameplayStrings,
  zhs: zhs.gameplayStrings,
  zht: zht.gameplayStrings,
};

export const keywordNames: Readonly<Record<Locale, readonly string[]>> = {
  en:  en.keywordNames,
  de:  de.keywordNames,
  es:  es.keywordNames,
  mx:  mx.keywordNames,
  fr:  fr.keywordNames,
  it:  it.keywordNames,
  ja:  ja.keywordNames,
  ko:  ko.keywordNames,
  pl:  pl.keywordNames,
  pt:  pt.keywordNames,
  ru:  ru.keywordNames,
  th:  th.keywordNames,
  zhs: zhs.keywordNames,
  zht: zht.keywordNames,
};

export const heraldNames: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en:  en.heraldNames,
  de:  de.heraldNames,
  es:  es.heraldNames,
  mx:  mx.heraldNames,
  fr:  fr.heraldNames,
  it:  it.heraldNames,
  ja:  ja.heraldNames,
  ko:  ko.heraldNames,
  pl:  pl.heraldNames,
  pt:  pt.heraldNames,
  ru:  ru.heraldNames,
  th:  th.heraldNames,
  zhs: zhs.heraldNames,
  zht: zht.heraldNames,
};

export const gameplayBuilderStrings: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en:  en.gameplayBuilderStrings,
  de:  de.gameplayBuilderStrings,
  es:  es.gameplayBuilderStrings,
  mx:  mx.gameplayBuilderStrings,
  fr:  fr.gameplayBuilderStrings,
  it:  it.gameplayBuilderStrings,
  ja:  ja.gameplayBuilderStrings,
  ko:  ko.gameplayBuilderStrings,
  pl:  pl.gameplayBuilderStrings,
  pt:  pt.gameplayBuilderStrings,
  ru:  ru.gameplayBuilderStrings,
  th:  th.gameplayBuilderStrings,
  zhs: zhs.gameplayBuilderStrings,
  zht: zht.gameplayBuilderStrings,
};

export const raceNames: Readonly<Record<Locale, { normal: Readonly<Record<number, string>>, battlegrounds: Readonly<Record<number, string>> }>> = {
  en:  en.raceNames,
  de:  de.raceNames,
  es:  es.raceNames,
  mx:  mx.raceNames,
  fr:  fr.raceNames,
  it:  it.raceNames,
  ja:  ja.raceNames,
  ko:  ko.raceNames,
  pl:  pl.raceNames,
  pt:  pt.raceNames,
  ru:  ru.raceNames,
  th:  th.raceNames,
  zhs: zhs.raceNames,
  zht: zht.raceNames,
};

export const classNames: Readonly<Record<Locale, Readonly<Record<number, string>>>> = {
  en:  en.classNames,
  de:  de.classNames,
  es:  es.classNames,
  mx:  mx.classNames,
  fr:  fr.classNames,
  it:  it.classNames,
  ja:  ja.classNames,
  ko:  ko.classNames,
  pl:  pl.classNames,
  pt:  pt.classNames,
  ru:  ru.classNames,
  th:  th.classNames,
  zhs: zhs.classNames,
  zht: zht.classNames,
};

export const zilliaxCombinedModuleTexts: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en:  en.zilliaxCombinedModuleTexts,
  de:  de.zilliaxCombinedModuleTexts,
  es:  es.zilliaxCombinedModuleTexts,
  mx:  mx.zilliaxCombinedModuleTexts,
  fr:  fr.zilliaxCombinedModuleTexts,
  it:  it.zilliaxCombinedModuleTexts,
  ja:  ja.zilliaxCombinedModuleTexts,
  ko:  ko.zilliaxCombinedModuleTexts,
  pl:  pl.zilliaxCombinedModuleTexts,
  pt:  pt.zilliaxCombinedModuleTexts,
  ru:  ru.zilliaxCombinedModuleTexts,
  th:  th.zilliaxCombinedModuleTexts,
  zhs: zhs.zilliaxCombinedModuleTexts,
  zht: zht.zilliaxCombinedModuleTexts,
};
