import { createHash } from 'node:crypto';
import { SaxesParser, type SaxesTagPlain } from 'saxes';

import {
  buildParsedEntity,
  type JsonMap,
  type ParsedHsdata,
  type RawTagInput,
} from './hsdata-import';

/** Nested XML child nodes preserved while parsing one hsdata entity. */
type XmlChild = XmlElement | string;

/** Extra referenced-tag values persisted from one entity payload. */
type ReferencedTagValue = boolean | number;

/** One XML node shape kept while streaming CardDefs.xml. */
interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlChild[];
}

/** XML parser input reduced to one snapshot hash payload. */
interface HsdataSnapshotInput {
  cardId: string;
  dbfId: number;
  entityXmlVersion: number;
  tags: RawTagInput[];
  extraPayload: JsonMap;
}

/** Parsed CardDefs root metadata and normalized entity subtrees. */
interface ParsedXmlDocument {
  rootName: string;
  rootAttributes: Record<string, string>;
  entities: XmlElement[];
}

/** Removes BOM and normalizes line endings before XML parsing. */
export const normalizeHsdataXmlSource = (input: string) => {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

/** Computes the stable source hash used by raw import guards. */
export const computeHsdataSourceHash = (input: string) => {
  return createHash('sha256').update(input, 'utf8').digest('hex');
};

/** Returns every child element with the requested tag name. */
const getElements = (node: XmlElement, name: string) => {
  return node.children.filter(child => typeof child !== 'string' && child.name === name) as XmlElement[];
};

/** Returns the trimmed text content for one XML node. */
const getText = (node: XmlElement) => {
  return node.children
    .filter((child): child is string => typeof child === 'string')
    .join('')
    .trim();
};

/** Parses one required integer XML attribute. */
const toInt = (value: string | undefined, field: string) => {
  if (value == null) {
    throw new Error(`Missing integer field: ${field}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer field ${field}: ${value}`);
  }

  return parsed;
};

/** Parses one optional integer XML attribute. */
const toOptionalInt = (value: string | undefined) => {
  if (value == null || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses one required XML boolean attribute. */
const toXmlBoolean = (value: string | undefined, field: string) => {
  if (value == null) {
    throw new Error(`Missing boolean field: ${field}`);
  }

  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(`Invalid boolean field ${field}: ${value}`);
};

/** Preserves boolean-like referenced-tag values as booleans and other flags as integers. */
const toFlagValue = (value: number): ReferencedTagValue => {
  if (value === 0 || value === 1) {
    return value === 1;
  }

  return value;
};

/** Parses one LocString tag payload into a locale map. */
const normalizeLocString = (tag: XmlElement) => {
  const value: Record<string, string> = {};

  for (const child of tag.children) {
    if (typeof child === 'string') {
      continue;
    }

    value[child.name] = getText(child);
  }

  return value;
};

/** Attaches one finalized child element to its parent or returns it as one top-level entity subtree. */
const attachParsedNode = (stack: XmlElement[], node: XmlElement, entities: XmlElement[]) => {
  const parent = stack.at(-1);
  if (parent) {
    parent.children.push(node);
    return;
  }

  if (node.name !== 'Entity') {
    throw new Error(`Unexpected top-level closing tag: ${node.name}`);
  }

  entities.push(node);
};

/** Converts one `saxes` open-tag payload into the lightweight element node used downstream. */
const toXmlElement = (tag: SaxesTagPlain): XmlElement => {
  return {
    name:       tag.name,
    attributes: { ...tag.attributes },
    children:   [],
  };
};

/** Parses CardDefs XML into the lightweight element tree consumed by the hsdata normalizers. */
const parseHsdataXmlDocument = (xml: string): ParsedXmlDocument => {
  let rootName: string | null = null;
  let rootAttributes: Record<string, string> | null = null;
  let rootClosed = false;
  let ignoredTopLevelDepth = 0;
  const stack: XmlElement[] = [];
  const entities: XmlElement[] = [];
  const parser = new SaxesParser({ xmlns: false, position: false });

  parser.on('opentag', tag => {
    const node = toXmlElement(tag);

    if (rootName == null) {
      rootName = node.name;
      rootAttributes = node.attributes;
      rootClosed = tag.isSelfClosing;
      return;
    }

    if (rootClosed) {
      throw new Error(`Unexpected XML content after root element ${rootName}`);
    }

    if (ignoredTopLevelDepth > 0) {
      if (!tag.isSelfClosing) {
        ignoredTopLevelDepth += 1;
      }

      return;
    }

    // Ignore non-Entity siblings directly under CardDefs so the temporary tree only holds
    // structures that can affect snapshot normalization.
    if (stack.length === 0 && node.name !== 'Entity') {
      if (!tag.isSelfClosing) {
        ignoredTopLevelDepth = 1;
      }

      return;
    }

    if (tag.isSelfClosing) {
      attachParsedNode(stack, node, entities);
      return;
    }

    stack.push(node);
  });

  parser.on('text', text => {
    if (ignoredTopLevelDepth > 0 || stack.length === 0 || text.length === 0) {
      return;
    }

    stack[stack.length - 1]!.children.push(text);
  });

  parser.on('cdata', cdata => {
    if (ignoredTopLevelDepth > 0 || stack.length === 0 || cdata.length === 0) {
      return;
    }

    stack[stack.length - 1]!.children.push(cdata);
  });

  parser.on('closetag', tag => {
    if (ignoredTopLevelDepth > 0) {
      ignoredTopLevelDepth -= 1;
      return;
    }

    if (tag.isSelfClosing) {
      return;
    }

    if (stack.length === 0) {
      if (tag.name !== rootName) {
        throw new Error(`Unexpected top-level closing tag: ${tag.name}`);
      }

      rootClosed = true;
      return;
    }

    const node = stack.pop();
    if (!node || node.name !== tag.name) {
      throw new Error(`Mismatched closing tag: ${tag.name}`);
    }

    attachParsedNode(stack, node, entities);
  });

  parser.on('error', error => {
    throw new Error(`Failed to parse CardDefs XML: ${error.message}`);
  });

  parser.write(xml).close();

  if (rootName == null || rootAttributes == null) {
    throw new Error('Failed to parse CardDefs.xml');
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed XML tag: ${stack[stack.length - 1]!.name}`);
  }

  if (!rootClosed) {
    throw new Error(`Missing closing tag for root element ${rootName}`);
  }

  return {
    rootName,
    rootAttributes,
    entities,
  };
};

/** Normalizes one raw `<Tag>` node into the canonical raw-tag payload. */
const normalizeRawTag = (tag: XmlElement, tagOrder: number): RawTagInput => {
  const enumId = toInt(tag.attributes.enumID, 'Tag.enumID');
  const rawName = tag.attributes.name ?? '';
  const rawType = tag.attributes.type ?? '';
  const rawValue = tag.attributes.value ?? null;
  const cardRefCardId = tag.attributes.cardID ?? null;

  const rawPayload: JsonMap = {
    attributes: { ...tag.attributes },
  };

  const locStringValue = rawType === 'LocString'
    ? normalizeLocString(tag)
    : null;

  if (locStringValue != null) {
    rawPayload.children = locStringValue;
  } else {
    const text = getText(tag);
    if (text.length > 0) {
      rawPayload.text = text;
    }
  }

  return {
    enumId,
    rawName,
    rawType,
    rawPayload,
    rawValue,
    locStringValue,
    cardRefCardId,
    tagOrder,
  };
};

/** Normalizes one entity-level extra payload block kept outside raw tags. */
const normalizeExtraPayload = (entity: XmlElement) => {
  const referencedTags = Object.fromEntries(
    getElements(entity, 'ReferencedTag').map(node => {
      const enumId = String(toInt(node.attributes.enumID, 'ReferencedTag.enumID'));
      const value = toInt(node.attributes.value ?? '1', 'ReferencedTag.value');

      return [enumId, toFlagValue(value)];
    }),
  );

  const powers = getElements(entity, 'Power').map(node => ({
    definition:       node.attributes.definition ?? '',
    playRequirements: getElements(node, 'PlayRequirement').map(requirement => {
      const param = toOptionalInt(requirement.attributes.param);

      return {
        reqId: toInt(requirement.attributes.reqID, 'PlayRequirement.reqID'),
        ...(param != null ? { param } : {}),
      };
    }),
  }));

  const entourageCards = getElements(entity, 'EntourageCard').map(node => ({
    cardId: node.attributes.cardID ?? '',
  }));

  const masterPowers = getElements(entity, 'MasterPower').map(node => getText(node));

  const triggeredPowerHistoryInfo = getElements(entity, 'TriggeredPowerHistoryInfo').map(node => ({
    effectIndex:   toInt(node.attributes.effectIndex, 'TriggeredPowerHistoryInfo.effectIndex'),
    showInHistory: toXmlBoolean(node.attributes.showInHistory, 'TriggeredPowerHistoryInfo.showInHistory'),
  }));

  return {
    referencedTags,
    powers,
    entourageCards,
    masterPowers,
    triggeredPowerHistoryInfo,
  } satisfies JsonMap;
};

/** Builds one normalized entity snapshot from the parsed XML node tree. */
const normalizeEntitySnapshot = (entity: XmlElement) => {
  const cardId = entity.attributes.CardID ?? '';
  if (cardId.length === 0) {
    throw new Error('Entity.CardID is required');
  }

  const snapshot: HsdataSnapshotInput = {
    cardId,
    dbfId:            toInt(entity.attributes.ID, 'Entity.ID'),
    entityXmlVersion: toInt(entity.attributes.version, 'Entity.version'),
    tags:             getElements(entity, 'Tag').map((tag, index) => normalizeRawTag(tag, index)),
    extraPayload:     normalizeExtraPayload(entity),
  };

  return buildParsedEntity(snapshot);
};

/** Rejects conflicting duplicate card ids while allowing byte-identical duplicates. */
const validateAndDedupeEntities = (entities: ReturnType<typeof buildParsedEntity>[]) => {
  const byCardId = new Map<string, ReturnType<typeof buildParsedEntity>>();

  for (const entity of entities) {
    const existing = byCardId.get(entity.cardId);

    if (!existing) {
      byCardId.set(entity.cardId, entity);
      continue;
    }

    if (existing.snapshotHash !== entity.snapshotHash) {
      throw new Error(`Conflicting snapshots found for cardId ${entity.cardId}`);
    }
  }

  return [...byCardId.values()];
};

/** Parses one CardDefs.xml document into the canonical hsdata import payload. */
export const parseHsdataXml = (xml: string): ParsedHsdata => {
  const document = parseHsdataXmlDocument(xml);
  if (document.rootName !== 'CardDefs') {
    throw new Error(`Unexpected root tag: ${document.rootName}`);
  }

  const build = toInt(document.rootAttributes.build, 'CardDefs.build');
  const entities = document.entities.map(entity => normalizeEntitySnapshot(entity));

  if (entities.length === 0) {
    throw new Error('CardDefs must contain at least one Entity');
  }

  return {
    build,
    entities: validateAndDedupeEntities(entities),
  };
};
