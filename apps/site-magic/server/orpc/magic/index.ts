import { cardApi, cardTrpc } from './card';
import { printApi, printTrpc } from './print';
import { searchApi, searchTrpc } from './search';
import { setApi, setTrpc } from './set';
import { formatApi, formatTrpc } from './format';
import { announcementApi, announcementTrpc } from './announcement';
import { documentApi, documentTrpc } from './document';
import { ruleApi, ruleTrpc } from './rule';
import { deckApi, deckTrpc } from './deck';
import { dataTrpc } from './data';
import { agentApi, agentTrpc } from './agent';

export const magicTrpc = {
  card:         cardTrpc,
  search:       searchTrpc,
  print:        printTrpc,
  set:          setTrpc,
  format:       formatTrpc,
  announcement: announcementTrpc,
  document:     documentTrpc,
  rule:         ruleTrpc,
  deck:         deckTrpc,
  data:         dataTrpc,
  agent:        agentTrpc,
};

export const magicApi = {
  card:         cardApi,
  search:       searchApi,
  print:        printApi,
  set:          setApi,
  format:       formatApi,
  announcement: announcementApi,
  document:     documentApi,
  rule:         ruleApi,
  deck:         deckApi,
  agent:        agentApi,
};
