use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde_json::{Map as JsonMap, Number, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;

pub const HSDATA_PAYLOAD_FORMAT_VERSION: &str = "snapshot-ndjson-v1";
pub const HSDATA_PAYLOAD_ENCODING: &str = "gzip";
pub const HSDATA_IMPORT_ENGINE_VERSION: &str = "desktop-rust-v1";

/// Localized string values keyed by locale code.
type LocalizedText = BTreeMap<String, String>;

/// XML child nodes preserved while one Entity subtree is normalized.
enum XmlChild {
    Element(XmlElement),
    Text(String),
}

/// Parsed XML element node with attributes and children.
struct XmlElement {
    name: String,
    attributes: BTreeMap<String, String>,
    children: Vec<XmlChild>,
}

/// Normalized raw tag payload emitted by the desktop parser.
#[derive(Clone, Debug, PartialEq)]
struct HsdataTagSnapshot {
    enum_id: u32,
    raw_name: String,
    raw_type: String,
    raw_payload: Value,
    raw_value: Option<String>,
    loc_string_value: Option<LocalizedText>,
    card_ref_card_id: Option<String>,
    tag_order: u32,
}

/// Normalized entity snapshot emitted by the desktop parser.
#[derive(Clone, Debug, PartialEq)]
struct HsdataEntitySnapshot {
    card_id: String,
    dbf_id: u32,
    entity_xml_version: u32,
    tags: Vec<HsdataTagSnapshot>,
    extra_payload: Value,
    snapshot_hash: String,
}

/// Parsed hsdata source document normalized from one CardDefs XML payload.
#[derive(Clone, Debug, PartialEq)]
struct ParsedHsdataDocument {
    build: u32,
    entities: Vec<HsdataEntitySnapshot>,
}

/// Canonical NDJSON chunk prepared from normalized entity snapshots.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedPayloadChunk {
    pub chunk_index: u32,
    pub entity_count: u32,
    pub payload_hash: String,
    pub ndjson: String,
}

/// Desktop-prepared hsdata payload that will later be uploaded chunk by chunk.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedPayload {
    pub build: u32,
    pub source_hash: String,
    pub payload_format_version: String,
    pub payload_encoding: String,
    pub import_engine_version: String,
    pub total_entity_count: u32,
    pub chunks: Vec<HsdataPreparedPayloadChunk>,
}

/// Stable sha256 digest encoded as lowercase hex.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());

    let mut output = String::with_capacity(64);
    for byte in hasher.finalize() {
        let _ = write!(&mut output, "{byte:02x}");
    }

    output
}

/// Source XML normalization shared by sourceHash generation and local parsing.
fn normalize_source_xml(input: &str) -> String {
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    input.replace("\r\n", "\n").replace('\r', "\n")
}

/// sourceHash computed from the normalized CardDefs XML payload.
fn compute_source_hash(input: &str) -> String {
    sha256_hex(&normalize_source_xml(input))
}

/// Parsed integer field extracted from one XML attribute.
fn parse_u32(value: Option<&str>, field: &str) -> Result<u32, String> {
    let value = value.ok_or_else(|| format!("Missing integer field: {field}"))?;
    value
        .parse::<u32>()
        .map_err(|_| format!("Invalid integer field {field}: {value}"))
}

/// Parsed signed integer field extracted from one XML attribute.
fn parse_i32(value: Option<&str>, field: &str) -> Result<i32, String> {
    let value = value.ok_or_else(|| format!("Missing integer field: {field}"))?;
    value
        .parse::<i32>()
        .map_err(|_| format!("Invalid integer field {field}: {value}"))
}

/// Optional integer field extracted from one XML attribute.
fn parse_optional_u32(value: Option<&str>) -> Result<Option<u32>, String> {
    match value {
        None => Ok(None),
        Some(value) if value.is_empty() => Ok(None),
        Some(value) => value
            .parse::<u32>()
            .map(Some)
            .map_err(|_| format!("Invalid integer field value: {value}")),
    }
}

/// XML boolean field parsed from one attribute value.
fn parse_xml_bool(value: Option<&str>, field: &str) -> Result<bool, String> {
    let value = value.ok_or_else(|| format!("Missing boolean field: {field}"))?;
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" => Ok(true),
        "false" | "0" => Ok(false),
        _ => Err(format!("Invalid boolean field {field}: {value}")),
    }
}

/// Flag-like integer values collapsed to booleans when possible.
fn to_flag_value(value: u32) -> Value {
    match value {
        0 => Value::Bool(false),
        1 => Value::Bool(true),
        _ => Value::Number(Number::from(value)),
    }
}

/// Direct child elements with the requested XML tag name.
fn get_elements<'a>(node: &'a XmlElement, name: &str) -> Vec<&'a XmlElement> {
    node.children
        .iter()
        .filter_map(|child| match child {
            XmlChild::Element(element) if element.name == name => Some(element),
            _ => None,
        })
        .collect()
}

/// Trimmed direct text content from one XML node.
fn get_text(node: &XmlElement) -> String {
    node.children
        .iter()
        .filter_map(|child| match child {
            XmlChild::Text(text) => Some(text.as_str()),
            XmlChild::Element(_) => None,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// XML attributes decoded into a string map.
fn decode_attributes(
    reader: &Reader<&[u8]>,
    event: &BytesStart<'_>,
) -> Result<BTreeMap<String, String>, String> {
    let mut attributes = BTreeMap::new();

    for attribute in event.attributes().with_checks(false) {
        let attribute =
            attribute.map_err(|error| format!("Failed to read XML attribute: {error}"))?;
        let key = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
        let value = attribute
            .decode_and_unescape_value(reader.decoder())
            .map_err(|error| format!("Failed to decode XML attribute {key}: {error}"))?
            .into_owned();
        attributes.insert(key, value);
    }

    Ok(attributes)
}

/// XML text node decoded and entity-unescaped.
fn decode_text(bytes: &[u8]) -> Result<String, String> {
    let raw = std::str::from_utf8(bytes)
        .map_err(|error| format!("Failed to decode XML text as UTF-8: {error}"))?;
    quick_xml::escape::unescape(raw)
        .map(|value| value.into_owned())
        .map_err(|error| format!("Failed to unescape XML text: {error}"))
}

/// JSON string literal appended to the output buffer.
fn write_json_string(output: &mut String, value: &str) -> Result<(), String> {
    output.push_str(
        &serde_json::to_string(value)
            .map_err(|error| format!("Failed to encode JSON string: {error}"))?,
    );
    Ok(())
}

/// Canonical JSON serializer with lexicographically sorted object keys.
fn write_canonical_json(output: &mut String, value: &Value) -> Result<(), String> {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&value.to_string()),
        Value::String(value) => write_json_string(output, value)?,
        Value::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_canonical_json(output, value)?;
            }
            output.push(']');
        }
        Value::Object(object) => {
            output.push('{');

            let mut keys = object.keys().collect::<Vec<_>>();
            keys.sort();

            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_json_string(output, key)?;
                output.push(':');
                write_canonical_json(output, &object[key])?;
            }

            output.push('}');
        }
    }

    Ok(())
}

/// Canonical JSON string derived from one serde_json value.
fn canonical_json(value: &Value) -> Result<String, String> {
    let mut output = String::new();
    write_canonical_json(&mut output, value)?;
    Ok(output)
}

/// Canonical JSON hash derived from one serde_json value.
fn hash_canonical_json(value: &Value) -> Result<String, String> {
    canonical_json(value).map(|json| sha256_hex(&json))
}

/// Locale maps serialized as canonical JSON objects.
fn localized_text_value(value: &LocalizedText) -> Value {
    let mut object = JsonMap::new();
    for (locale, text) in value {
        object.insert(locale.clone(), Value::String(text.clone()));
    }
    Value::Object(object)
}

/// JSON object built from one XML attribute map.
fn attributes_value(attributes: &BTreeMap<String, String>) -> Value {
    let mut object = JsonMap::new();
    for (key, value) in attributes {
        object.insert(key.clone(), Value::String(value.clone()));
    }
    Value::Object(object)
}

/// LocString child nodes normalized into locale maps.
fn normalize_loc_string(tag: &XmlElement) -> LocalizedText {
    let mut value = LocalizedText::new();

    for child in &tag.children {
        if let XmlChild::Element(child) = child {
            value.insert(child.name.clone(), get_text(child));
        }
    }

    value
}

/// Raw Tag XML nodes normalized into snapshot tag payloads.
fn normalize_raw_tag(tag: &XmlElement, tag_order: usize) -> Result<HsdataTagSnapshot, String> {
    let enum_id = parse_u32(
        tag.attributes.get("enumID").map(String::as_str),
        "Tag.enumID",
    )?;
    let raw_name = tag.attributes.get("name").cloned().unwrap_or_default();
    let raw_type = tag.attributes.get("type").cloned().unwrap_or_default();
    let raw_value = tag.attributes.get("value").cloned();
    let card_ref_card_id = tag.attributes.get("cardID").cloned();

    let mut raw_payload = JsonMap::new();
    raw_payload.insert("attributes".to_string(), attributes_value(&tag.attributes));

    let loc_string_value = if raw_type == "LocString" {
        Some(normalize_loc_string(tag))
    } else {
        None
    };

    if let Some(loc_string_value) = &loc_string_value {
        raw_payload.insert(
            "children".to_string(),
            localized_text_value(loc_string_value),
        );
    } else {
        let text = get_text(tag);
        if !text.is_empty() {
            raw_payload.insert("text".to_string(), Value::String(text));
        }
    }

    Ok(HsdataTagSnapshot {
        enum_id,
        raw_name,
        raw_type,
        raw_payload: Value::Object(raw_payload),
        raw_value,
        loc_string_value,
        card_ref_card_id,
        tag_order: u32::try_from(tag_order)
            .map_err(|_| "Too many Tag nodes in one Entity".to_string())?,
    })
}

/// Non-Tag entity payload that still contributes to snapshot identity.
fn normalize_extra_payload(entity: &XmlElement) -> Result<Value, String> {
    let mut referenced_tags = JsonMap::new();
    for node in get_elements(entity, "ReferencedTag") {
        let enum_id = parse_u32(
            node.attributes.get("enumID").map(String::as_str),
            "ReferencedTag.enumID",
        )?;
        let value = parse_u32(
            node.attributes
                .get("value")
                .map(String::as_str)
                .or(Some("1")),
            "ReferencedTag.value",
        )?;
        referenced_tags.insert(enum_id.to_string(), to_flag_value(value));
    }

    let mut powers = Vec::new();
    for node in get_elements(entity, "Power") {
        let mut power = JsonMap::new();
        power.insert(
            "definition".to_string(),
            Value::String(
                node.attributes
                    .get("definition")
                    .cloned()
                    .unwrap_or_default(),
            ),
        );

        let mut play_requirements = Vec::new();
        for requirement in get_elements(node, "PlayRequirement") {
            let mut row = JsonMap::new();
            row.insert(
                "reqId".to_string(),
                Value::Number(Number::from(parse_u32(
                    requirement.attributes.get("reqID").map(String::as_str),
                    "PlayRequirement.reqID",
                )?)),
            );

            if let Some(param) =
                parse_optional_u32(requirement.attributes.get("param").map(String::as_str))?
            {
                row.insert("param".to_string(), Value::Number(Number::from(param)));
            }

            play_requirements.push(Value::Object(row));
        }

        power.insert(
            "playRequirements".to_string(),
            Value::Array(play_requirements),
        );
        powers.push(Value::Object(power));
    }

    let entourage_cards = get_elements(entity, "EntourageCard")
        .into_iter()
        .map(|node| {
            let mut row = JsonMap::new();
            row.insert(
                "cardId".to_string(),
                Value::String(node.attributes.get("cardID").cloned().unwrap_or_default()),
            );
            Value::Object(row)
        })
        .collect::<Vec<_>>();

    let master_powers = get_elements(entity, "MasterPower")
        .into_iter()
        .map(|node| Value::String(get_text(node)))
        .collect::<Vec<_>>();

    let mut triggered_power_history_info = Vec::new();
    for node in get_elements(entity, "TriggeredPowerHistoryInfo") {
        let mut row = JsonMap::new();
        row.insert(
            "effectIndex".to_string(),
            Value::Number(Number::from(parse_i32(
                node.attributes.get("effectIndex").map(String::as_str),
                "TriggeredPowerHistoryInfo.effectIndex",
            )?)),
        );
        row.insert(
            "showInHistory".to_string(),
            Value::Bool(parse_xml_bool(
                node.attributes.get("showInHistory").map(String::as_str),
                "TriggeredPowerHistoryInfo.showInHistory",
            )?),
        );
        triggered_power_history_info.push(Value::Object(row));
    }

    let mut payload = JsonMap::new();
    payload.insert("referencedTags".to_string(), Value::Object(referenced_tags));
    payload.insert("powers".to_string(), Value::Array(powers));
    payload.insert("entourageCards".to_string(), Value::Array(entourage_cards));
    payload.insert("masterPowers".to_string(), Value::Array(master_powers));
    payload.insert(
        "triggeredPowerHistoryInfo".to_string(),
        Value::Array(triggered_power_history_info),
    );

    Ok(Value::Object(payload))
}

/// Snapshot-hash input payload built from one normalized entity snapshot.
fn snapshot_hash_value(entity: &HsdataEntitySnapshot) -> Value {
    let tags = entity
        .tags
        .iter()
        .map(|tag| {
            let mut value = JsonMap::new();
            value.insert(
                "enumId".to_string(),
                Value::Number(Number::from(tag.enum_id)),
            );
            value.insert("rawName".to_string(), Value::String(tag.raw_name.clone()));
            value.insert("rawType".to_string(), Value::String(tag.raw_type.clone()));
            value.insert(
                "rawValue".to_string(),
                match &tag.raw_value {
                    Some(value) => Value::String(value.clone()),
                    None => Value::Null,
                },
            );
            value.insert(
                "locStringValue".to_string(),
                match &tag.loc_string_value {
                    Some(value) => localized_text_value(value),
                    None => Value::Null,
                },
            );
            value.insert(
                "cardRefCardId".to_string(),
                match &tag.card_ref_card_id {
                    Some(value) => Value::String(value.clone()),
                    None => Value::Null,
                },
            );
            value.insert(
                "tagOrder".to_string(),
                Value::Number(Number::from(tag.tag_order)),
            );
            value.insert("rawPayload".to_string(), tag.raw_payload.clone());
            Value::Object(value)
        })
        .collect::<Vec<_>>();

    let mut value = JsonMap::new();
    value.insert("cardId".to_string(), Value::String(entity.card_id.clone()));
    value.insert(
        "dbfId".to_string(),
        Value::Number(Number::from(entity.dbf_id)),
    );
    value.insert(
        "entityXmlVersion".to_string(),
        Value::Number(Number::from(entity.entity_xml_version)),
    );
    value.insert("tags".to_string(), Value::Array(tags));
    value.insert("extraPayload".to_string(), entity.extra_payload.clone());
    Value::Object(value)
}

/// Normalized Entity nodes plus snapshot hashes derived from their canonical payloads.
fn normalize_entity_snapshot(entity: &XmlElement) -> Result<HsdataEntitySnapshot, String> {
    let card_id = entity.attributes.get("CardID").cloned().unwrap_or_default();
    if card_id.is_empty() {
        return Err("Entity.CardID is required".to_string());
    }

    let dbf_id = parse_u32(entity.attributes.get("ID").map(String::as_str), "Entity.ID")?;
    let entity_xml_version = parse_u32(
        entity.attributes.get("version").map(String::as_str),
        "Entity.version",
    )?;
    let tags = get_elements(entity, "Tag")
        .into_iter()
        .enumerate()
        .map(|(index, tag)| normalize_raw_tag(tag, index))
        .collect::<Result<Vec<_>, _>>()?;
    let extra_payload = normalize_extra_payload(entity)?;

    let mut snapshot = HsdataEntitySnapshot {
        card_id,
        dbf_id,
        entity_xml_version,
        tags,
        extra_payload,
        snapshot_hash: String::new(),
    };
    snapshot.snapshot_hash = hash_canonical_json(&snapshot_hash_value(&snapshot))?;
    Ok(snapshot)
}

/// Duplicate card ids reduced to one snapshot or rejected when payloads conflict.
fn validate_and_dedupe_entities(
    entities: Vec<HsdataEntitySnapshot>,
) -> Result<Vec<HsdataEntitySnapshot>, String> {
    let mut by_card_id = HashMap::<String, String>::new();
    let mut deduped = Vec::new();

    for entity in entities {
        match by_card_id.get(&entity.card_id) {
            None => {
                by_card_id.insert(entity.card_id.clone(), entity.snapshot_hash.clone());
                deduped.push(entity);
            }
            Some(existing_hash) if existing_hash == &entity.snapshot_hash => {}
            Some(_) => {
                return Err(format!(
                    "Conflicting snapshots found for cardId {}",
                    entity.card_id
                ));
            }
        }
    }

    Ok(deduped)
}

/// XML tag name decoded from one quick-xml event.
fn decode_tag_name(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Child XML node attached to the current parent or finalized as one Entity.
fn finish_node(
    stack: &mut Vec<XmlElement>,
    node: XmlElement,
    entities: &mut Vec<HsdataEntitySnapshot>,
) -> Result<(), String> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(XmlChild::Element(node));
        return Ok(());
    }

    if node.name != "Entity" {
        return Err(format!("Unexpected top-level closing tag: {}", node.name));
    }

    entities.push(normalize_entity_snapshot(&node)?);
    Ok(())
}

/// CardDefs XML parsed into normalized entity snapshots.
fn parse_hsdata_xml(xml: &str) -> Result<ParsedHsdataDocument, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut stack = Vec::<XmlElement>::new();
    let mut entities = Vec::<HsdataEntitySnapshot>::new();
    let mut build = None;
    let mut has_root = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let name = decode_tag_name(event.name().as_ref());
                let attributes = decode_attributes(&reader, &event)?;

                if !has_root {
                    if name != "CardDefs" {
                        return Err(format!("Unexpected root tag: {name}"));
                    }

                    has_root = true;
                    build = Some(parse_u32(
                        attributes.get("build").map(String::as_str),
                        "CardDefs.build",
                    )?);
                    continue;
                }

                if stack.is_empty() && name != "Entity" {
                    continue;
                }

                stack.push(XmlElement {
                    name,
                    attributes,
                    children: Vec::new(),
                });
            }
            Ok(Event::Empty(event)) => {
                let name = decode_tag_name(event.name().as_ref());
                let attributes = decode_attributes(&reader, &event)?;

                if !has_root {
                    if name != "CardDefs" {
                        return Err(format!("Unexpected root tag: {name}"));
                    }

                    has_root = true;
                    build = Some(parse_u32(
                        attributes.get("build").map(String::as_str),
                        "CardDefs.build",
                    )?);
                    continue;
                }

                if stack.is_empty() && name != "Entity" {
                    continue;
                }

                finish_node(
                    &mut stack,
                    XmlElement {
                        name,
                        attributes,
                        children: Vec::new(),
                    },
                    &mut entities,
                )?;
            }
            Ok(Event::End(_)) => {
                if let Some(node) = stack.pop() {
                    finish_node(&mut stack, node, &mut entities)?;
                }
            }
            Ok(Event::Text(event)) => {
                if let Some(node) = stack.last_mut() {
                    let text = decode_text(event.as_ref())?;
                    if !text.is_empty() {
                        node.children.push(XmlChild::Text(text));
                    }
                }
            }
            Ok(Event::CData(event)) => {
                if let Some(node) = stack.last_mut() {
                    let text = String::from_utf8_lossy(event.as_ref()).into_owned();
                    if !text.is_empty() {
                        node.children.push(XmlChild::Text(text));
                    }
                }
            }
            Ok(Event::Comment(_))
            | Ok(Event::Decl(_))
            | Ok(Event::PI(_))
            | Ok(Event::DocType(_))
            | Ok(Event::GeneralRef(_)) => {}
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse CardDefs XML: {error}")),
        }
    }

    let build = build.ok_or_else(|| "Missing CardDefs.build".to_string())?;
    if entities.is_empty() {
        return Err("CardDefs must contain at least one Entity".to_string());
    }

    Ok(ParsedHsdataDocument {
        build,
        entities: validate_and_dedupe_entities(entities)?,
    })
}

/// Canonical NDJSON tag record serialized in the fixed field order.
fn write_tag_record(output: &mut String, tag: &HsdataTagSnapshot) -> Result<(), String> {
    output.push('{');
    output.push_str("\"enumId\":");
    output.push_str(&tag.enum_id.to_string());
    output.push(',');
    output.push_str("\"rawName\":");
    write_json_string(output, &tag.raw_name)?;
    output.push(',');
    output.push_str("\"rawType\":");
    write_json_string(output, &tag.raw_type)?;
    output.push(',');
    output.push_str("\"rawPayload\":");
    write_canonical_json(output, &tag.raw_payload)?;
    output.push(',');
    output.push_str("\"rawValue\":");
    match &tag.raw_value {
        Some(value) => write_json_string(output, value)?,
        None => output.push_str("null"),
    }
    output.push(',');
    output.push_str("\"locStringValue\":");
    match &tag.loc_string_value {
        Some(value) => write_canonical_json(output, &localized_text_value(value))?,
        None => output.push_str("null"),
    }
    output.push(',');
    output.push_str("\"cardRefCardId\":");
    match &tag.card_ref_card_id {
        Some(value) => write_json_string(output, value)?,
        None => output.push_str("null"),
    }
    output.push(',');
    output.push_str("\"tagOrder\":");
    output.push_str(&tag.tag_order.to_string());
    output.push('}');
    Ok(())
}

/// Canonical NDJSON line serialized from one normalized entity snapshot.
fn serialize_snapshot_line(entity: &HsdataEntitySnapshot) -> Result<String, String> {
    let mut output = String::new();
    output.push('{');
    output.push_str("\"cardId\":");
    write_json_string(&mut output, &entity.card_id)?;
    output.push(',');
    output.push_str("\"dbfId\":");
    output.push_str(&entity.dbf_id.to_string());
    output.push(',');
    output.push_str("\"entityXmlVersion\":");
    output.push_str(&entity.entity_xml_version.to_string());
    output.push(',');
    output.push_str("\"tags\":[");
    for (index, tag) in entity.tags.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        write_tag_record(&mut output, tag)?;
    }
    output.push(']');
    output.push(',');
    output.push_str("\"extraPayload\":");
    write_canonical_json(&mut output, &entity.extra_payload)?;
    output.push('}');
    output.push('\n');
    Ok(output)
}

/// Canonical NDJSON chunks built from one normalized entity list.
fn build_chunks(
    entities: &[HsdataEntitySnapshot],
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
) -> Result<Vec<HsdataPreparedPayloadChunk>, String> {
    if max_bytes_per_chunk == 0 {
        return Err("max_bytes_per_chunk must be greater than 0".to_string());
    }

    if max_entities_per_chunk == 0 {
        return Err("max_entities_per_chunk must be greater than 0".to_string());
    }

    let mut chunks = Vec::new();
    let mut current_lines = Vec::<String>::new();
    let mut current_bytes = 0usize;

    for entity in entities {
        let line = serialize_snapshot_line(entity)?;
        let line_bytes = line.as_bytes().len();

        if line_bytes > max_bytes_per_chunk {
            return Err(format!(
                "Entity {} exceeds max_bytes_per_chunk",
                entity.card_id
            ));
        }

        let should_flush = !current_lines.is_empty()
            && (current_lines.len() >= max_entities_per_chunk
                || current_bytes + line_bytes > max_bytes_per_chunk);

        if should_flush {
            let ndjson = current_lines.concat();
            chunks.push(HsdataPreparedPayloadChunk {
                chunk_index: u32::try_from(chunks.len())
                    .map_err(|_| "Too many NDJSON chunks to index".to_string())?,
                entity_count: u32::try_from(current_lines.len())
                    .map_err(|_| "Too many entities inside one NDJSON chunk".to_string())?,
                payload_hash: sha256_hex(&ndjson),
                ndjson,
            });
            current_lines.clear();
            current_bytes = 0;
        }

        current_bytes += line_bytes;
        current_lines.push(line);
    }

    if !current_lines.is_empty() {
        let ndjson = current_lines.concat();
        chunks.push(HsdataPreparedPayloadChunk {
            chunk_index: u32::try_from(chunks.len())
                .map_err(|_| "Too many NDJSON chunks to index".to_string())?,
            entity_count: u32::try_from(current_lines.len())
                .map_err(|_| "Too many entities inside one NDJSON chunk".to_string())?,
            payload_hash: sha256_hex(&ndjson),
            ndjson,
        });
    }

    if chunks.is_empty() {
        return Err("No hsdata entities were prepared for import".to_string());
    }

    Ok(chunks)
}

/// Canonical NDJSON chunks prepared from one hsdata CardDefs XML payload.
pub fn prepare_hsdata_payload(
    xml: &str,
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
) -> Result<HsdataPreparedPayload, String> {
    let normalized_xml = normalize_source_xml(xml);
    let parsed = parse_hsdata_xml(&normalized_xml)?;
    let chunks = build_chunks(
        &parsed.entities,
        max_bytes_per_chunk,
        max_entities_per_chunk,
    )?;

    Ok(HsdataPreparedPayload {
        build: parsed.build,
        source_hash: compute_source_hash(xml),
        payload_format_version: HSDATA_PAYLOAD_FORMAT_VERSION.to_string(),
        payload_encoding: HSDATA_PAYLOAD_ENCODING.to_string(),
        import_engine_version: HSDATA_IMPORT_ENGINE_VERSION.to_string(),
        total_entity_count: u32::try_from(parsed.entities.len())
            .map_err(|_| "Too many hsdata entities to count".to_string())?,
        chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        prepare_hsdata_payload, sha256_hex, HSDATA_IMPORT_ENGINE_VERSION, HSDATA_PAYLOAD_ENCODING,
        HSDATA_PAYLOAD_FORMAT_VERSION,
    };

    /// Canonical payload generation stays stable for a simple single-entity source.
    #[test]
    fn prepares_canonical_ndjson_payload() {
        let xml = r#"<CardDefs build="7"><Entity CardID="CARD_001" ID="1" version="1"><Tag enumID="1" name="ONE" type="String" value="abc"/></Entity></CardDefs>"#;
        let prepared = prepare_hsdata_payload(xml, usize::MAX, usize::MAX).unwrap();

        let expected_ndjson = concat!(
            "{\"cardId\":\"CARD_001\",\"dbfId\":1,\"entityXmlVersion\":1,\"tags\":[",
            "{\"enumId\":1,\"rawName\":\"ONE\",\"rawType\":\"String\",\"rawPayload\":{\"attributes\":{\"enumID\":\"1\",\"name\":\"ONE\",\"type\":\"String\",\"value\":\"abc\"}},\"rawValue\":\"abc\",\"locStringValue\":null,\"cardRefCardId\":null,\"tagOrder\":0}",
            "],\"extraPayload\":{\"entourageCards\":[],\"masterPowers\":[],\"powers\":[],\"referencedTags\":{},\"triggeredPowerHistoryInfo\":[]}}\n",
        );

        assert_eq!(prepared.build, 7);
        assert_eq!(prepared.source_hash, sha256_hex(xml));
        assert_eq!(
            prepared.payload_format_version,
            HSDATA_PAYLOAD_FORMAT_VERSION
        );
        assert_eq!(prepared.payload_encoding, HSDATA_PAYLOAD_ENCODING);
        assert_eq!(prepared.import_engine_version, HSDATA_IMPORT_ENGINE_VERSION);
        assert_eq!(prepared.total_entity_count, 1);
        assert_eq!(prepared.chunks.len(), 1);
        assert_eq!(prepared.chunks[0].chunk_index, 0);
        assert_eq!(prepared.chunks[0].entity_count, 1);
        assert_eq!(prepared.chunks[0].ndjson, expected_ndjson);
        assert_eq!(prepared.chunks[0].payload_hash, sha256_hex(expected_ndjson));
    }

    /// Entity-count chunking keeps chunk boundaries stable.
    #[test]
    fn splits_chunks_by_entity_limit() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\"><Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/></Entity>",
            "<Entity CardID=\"CARD_002\" ID=\"2\" version=\"1\"><Tag enumID=\"2\" name=\"TWO\" type=\"String\" value=\"def\"/></Entity>",
            "</CardDefs>",
        );

        let prepared = prepare_hsdata_payload(xml, usize::MAX, 1).unwrap();

        assert_eq!(prepared.total_entity_count, 2);
        assert_eq!(prepared.chunks.len(), 2);
        assert_eq!(prepared.chunks[0].entity_count, 1);
        assert_eq!(prepared.chunks[1].entity_count, 1);
        assert!(prepared.chunks[0].ndjson.contains("\"CARD_001\""));
        assert!(prepared.chunks[1].ndjson.contains("\"CARD_002\""));
    }

    /// Duplicate card ids with different snapshot payloads are rejected.
    #[test]
    fn rejects_conflicting_duplicate_card_ids() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\"></Entity>",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"2\"></Entity>",
            "</CardDefs>",
        );

        let error = prepare_hsdata_payload(xml, usize::MAX, usize::MAX).unwrap_err();
        assert_eq!(error, "Conflicting snapshots found for cardId CARD_001");
    }

    /// Signed effect indexes remain valid inside TriggeredPowerHistoryInfo payloads.
    #[test]
    fn accepts_negative_triggered_power_history_effect_index() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\">",
            "<TriggeredPowerHistoryInfo effectIndex=\"-1\" showInHistory=\"true\"/>",
            "</Entity>",
            "</CardDefs>",
        );

        let prepared = prepare_hsdata_payload(xml, usize::MAX, usize::MAX).unwrap();

        assert_eq!(prepared.chunks.len(), 1);
        assert!(
            prepared.chunks[0]
                .ndjson
                .contains("\"triggeredPowerHistoryInfo\":[{\"effectIndex\":-1,\"showInHistory\":true}]")
        );
    }
}
