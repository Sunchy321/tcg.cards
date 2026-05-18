use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde_json::{Map as JsonMap, Number, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;
use std::time::Instant;

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
pub struct HsdataTagSnapshot {
    pub enum_id: u32,
    pub raw_name: String,
    pub raw_type: String,
    pub raw_payload: Value,
    // Keep the canonical bytes beside the structured value because the same payload is reused by
    // compatibility hashing and the final entity serializer.
    pub raw_payload_json: String,
    pub raw_value: Option<String>,
    pub loc_string_value: Option<LocalizedText>,
    // Cache the canonical LocString bytes once so later paths do not reserialize the locale map.
    pub loc_string_value_json: Option<String>,
    pub card_ref_card_id: Option<String>,
    pub tag_order: u32,
}

/// Normalized entity snapshot emitted by the desktop parser.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataEntitySnapshot {
    pub card_id: String,
    pub dbf_id: u32,
    pub entity_xml_version: u32,
    pub tags: Vec<HsdataTagSnapshot>,
    pub extra_payload: Value,
    // Extra payload is read structurally in tests, but hot production paths consume these bytes.
    pub extra_payload_json: String,
    // Eager canonical serialization looks early, but chunk building and dedupe both need it.
    pub serialized_json: String,
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

/// One normalized entity batch prepared for the local streaming import path.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataEntityBatch {
    pub batch_index: u32,
    pub entity_count: u32,
    pub estimated_bytes: usize,
    pub entities: Vec<HsdataEntitySnapshot>,
}

/// Source-level metadata prepared for the local streaming import path.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedStream {
    pub build: u32,
    pub source_hash: String,
    pub payload_encoding: String,
    pub import_engine_version: String,
    pub total_entity_count: u32,
}

/// Fine-grained timings captured while one hsdata payload is prepared locally.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedPayloadProfile {
    pub normalized_xml_bytes: usize,
    pub total_entity_count: u32,
    pub chunk_count: u32,
    pub normalize_xml_ms: u128,
    pub parse_xml_ms: u128,
    pub parse_xml_profile: HsdataParseXmlProfile,
    pub build_chunks_ms: u128,
    pub build_chunks_profile: HsdataBuildChunksProfile,
    pub compute_source_hash_ms: u128,
    pub total_ms: u128,
}

/// Fine-grained timings captured while one hsdata entity stream is prepared locally.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedStreamProfile {
    pub normalized_xml_bytes: usize,
    pub total_entity_count: u32,
    pub batch_count: u32,
    pub normalize_xml_ms: u128,
    pub parse_xml_ms: u128,
    pub parse_xml_profile: HsdataParseXmlProfile,
    pub split_batches_ms: u128,
    pub total_ms: u128,
}

/// Aggregate timings and counts collected while one hsdata XML payload is parsed.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HsdataParseXmlProfile {
    pub start_event_count: usize,
    pub empty_event_count: usize,
    pub end_event_count: usize,
    pub text_event_count: usize,
    pub cdata_event_count: usize,
    pub decoded_attribute_count: usize,
    pub decoded_text_node_count: usize,
    pub decoded_text_bytes: usize,
    pub parsed_entity_count: usize,
    pub deduped_entity_count: usize,
    pub tag_count: usize,
    pub loc_string_tag_count: usize,
    pub read_event_ms: u128,
    pub decode_attributes_ms: u128,
    pub decode_text_ms: u128,
    pub normalize_entity_ms: u128,
    pub normalize_tags_ms: u128,
    pub normalize_extra_payload_ms: u128,
    pub serialize_snapshot_json_ms: u128,
    // Kept for profiler compatibility. The optimized parse path no longer computes local snapshot
    // hashes during normalization, so this now remains zero in production runs.
    pub hash_serialized_snapshot_ms: u128,
    // Kept for profiler compatibility. Duplicate detection compares cached canonical JSON instead
    // of hashing the same payload again.
    pub snapshot_hash_ms: u128,
    pub validate_dedupe_ms: u128,
    pub total_ms: u128,
}

/// High-precision parse timings accumulated before conversion to log-friendly milliseconds.
///
/// Nanoseconds are tracked first so repeated sub-millisecond steps do not disappear into `0 ms`
/// buckets before the totals are aggregated.
#[derive(Clone, Debug, Default, PartialEq)]
struct HsdataParseXmlAccumulator {
    start_event_count: usize,
    empty_event_count: usize,
    end_event_count: usize,
    text_event_count: usize,
    cdata_event_count: usize,
    decoded_attribute_count: usize,
    decoded_text_node_count: usize,
    decoded_text_bytes: usize,
    parsed_entity_count: usize,
    deduped_entity_count: usize,
    tag_count: usize,
    loc_string_tag_count: usize,
    read_event_ns: u128,
    decode_attributes_ns: u128,
    decode_text_ns: u128,
    normalize_entity_ns: u128,
    normalize_tags_ns: u128,
    normalize_extra_payload_ns: u128,
    serialize_snapshot_json_ns: u128,
    hash_serialized_snapshot_ns: u128,
    snapshot_hash_ns: u128,
    validate_dedupe_ns: u128,
}

/// Aggregate timings and counts collected while canonical NDJSON chunks are assembled.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HsdataBuildChunksProfile {
    pub serialized_line_count: usize,
    pub serialized_line_bytes: usize,
    pub materialize_line_ms: u128,
    pub update_chunk_hash_ms: u128,
    pub append_chunk_ms: u128,
    pub flush_chunk_ms: u128,
}

/// High-precision chunk assembly timings accumulated before conversion to milliseconds.
///
/// Chunk assembly became fast enough that several hot steps regularly fall below 1 ms, so the
/// accumulator keeps nanoseconds until the final profile is emitted.
#[derive(Clone, Debug, Default, PartialEq)]
struct HsdataBuildChunksAccumulator {
    serialized_line_count: usize,
    serialized_line_bytes: usize,
    materialize_line_ns: u128,
    update_chunk_hash_ns: u128,
    append_chunk_ns: u128,
    flush_chunk_ns: u128,
}

/// Prepared payload paired with its local profiling summary.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedPayloadResult {
    pub payload: HsdataPreparedPayload,
    pub profile: HsdataPreparedPayloadProfile,
}

/// Prepared entity batches paired with the local streaming profiling summary.
#[derive(Clone, Debug, PartialEq)]
pub struct HsdataPreparedStreamResult {
    pub source: HsdataPreparedStream,
    pub batches: Vec<HsdataEntityBatch>,
    pub profile: HsdataPreparedStreamProfile,
}

/// Canonical source XML paired with the matching normalized source hash.
struct NormalizedSourceXml {
    xml: String,
    source_hash: String,
}

/// Parsed hsdata document paired with the parser profiling summary.
struct ParseHsdataXmlResult {
    document: ParsedHsdataDocument,
    profile: HsdataParseXmlProfile,
}

/// NDJSON chunks paired with detailed chunk-assembly profiling.
struct BuildChunksResult {
    chunks: Vec<HsdataPreparedPayloadChunk>,
    profile: HsdataBuildChunksProfile,
}

/// Normalized entity batches paired with lightweight batch-splitting profiling.
struct BuildEntityBatchesResult {
    batches: Vec<HsdataEntityBatch>,
}

impl HsdataParseXmlAccumulator {
    /// Finalized parse profiling converted into log-friendly millisecond fields.
    fn finish(self, total_started_at: &Instant) -> HsdataParseXmlProfile {
        HsdataParseXmlProfile {
            start_event_count: self.start_event_count,
            empty_event_count: self.empty_event_count,
            end_event_count: self.end_event_count,
            text_event_count: self.text_event_count,
            cdata_event_count: self.cdata_event_count,
            decoded_attribute_count: self.decoded_attribute_count,
            decoded_text_node_count: self.decoded_text_node_count,
            decoded_text_bytes: self.decoded_text_bytes,
            parsed_entity_count: self.parsed_entity_count,
            deduped_entity_count: self.deduped_entity_count,
            tag_count: self.tag_count,
            loc_string_tag_count: self.loc_string_tag_count,
            read_event_ms: nanos_to_millis(self.read_event_ns),
            decode_attributes_ms: nanos_to_millis(self.decode_attributes_ns),
            decode_text_ms: nanos_to_millis(self.decode_text_ns),
            normalize_entity_ms: nanos_to_millis(self.normalize_entity_ns),
            normalize_tags_ms: nanos_to_millis(self.normalize_tags_ns),
            normalize_extra_payload_ms: nanos_to_millis(self.normalize_extra_payload_ns),
            serialize_snapshot_json_ms: nanos_to_millis(self.serialize_snapshot_json_ns),
            hash_serialized_snapshot_ms: nanos_to_millis(self.hash_serialized_snapshot_ns),
            snapshot_hash_ms: nanos_to_millis(self.snapshot_hash_ns),
            validate_dedupe_ms: nanos_to_millis(self.validate_dedupe_ns),
            total_ms: elapsed_millis(total_started_at),
        }
    }
}

impl HsdataBuildChunksAccumulator {
    /// Finalized chunk-assembly profiling converted into log-friendly millisecond fields.
    fn finish(self) -> HsdataBuildChunksProfile {
        HsdataBuildChunksProfile {
            serialized_line_count: self.serialized_line_count,
            serialized_line_bytes: self.serialized_line_bytes,
            materialize_line_ms: nanos_to_millis(self.materialize_line_ns),
            update_chunk_hash_ms: nanos_to_millis(self.update_chunk_hash_ns),
            append_chunk_ms: nanos_to_millis(self.append_chunk_ns),
            flush_chunk_ms: nanos_to_millis(self.flush_chunk_ns),
        }
    }
}

/// Whole-millisecond duration measured from one monotonic timer.
fn elapsed_millis(started_at: &Instant) -> u128 {
    started_at.elapsed().as_millis()
}

/// Whole-nanosecond duration measured from one monotonic timer.
fn elapsed_nanos(started_at: &Instant) -> u128 {
    started_at.elapsed().as_nanos()
}

/// Elapsed milliseconds accumulated into one running profiling total.
fn add_elapsed(total_ms: &mut u128, started_at: &Instant) {
    *total_ms += elapsed_millis(started_at);
}

/// Elapsed nanoseconds accumulated into one high-precision profiling total.
fn add_elapsed_nanos(total_ns: &mut u128, started_at: &Instant) {
    *total_ns += elapsed_nanos(started_at);
}

/// Milliseconds rounded down from one accumulated nanosecond total.
fn nanos_to_millis(total_ns: u128) -> u128 {
    total_ns / 1_000_000
}

/// Lowercase hex string encoded from one finalized sha256 hasher.
fn finish_sha256_hex(hasher: Sha256) -> String {
    let digest = hasher.finalize();
    let mut output = String::with_capacity(64);
    for byte in digest {
        let _ = write!(&mut output, "{byte:02x}");
    }

    output
}

/// Stable sha256 digest encoded as lowercase hex.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    finish_sha256_hex(hasher)
}

/// Source XML normalized into canonical line endings and matching source hash.
fn normalize_source_xml(input: &str) -> NormalizedSourceXml {
    let input_bytes = input.as_bytes();
    let start = usize::from(input_bytes.starts_with(&[0xef, 0xbb, 0xbf])) * 3;
    let mut xml = String::with_capacity(input.len().saturating_sub(start));
    let mut hasher = Sha256::new();
    let mut segment_start = start;
    let mut index = start;

    // Normalize line endings and update the source hash in the same pass so 20MB+ XML payloads do
    // not need a second full scan just to compute the canonical hash input.
    while index < input_bytes.len() {
        if input_bytes[index] != b'\r' {
            index += 1;
            continue;
        }

        if segment_start < index {
            let segment = &input[segment_start..index];
            xml.push_str(segment);
            hasher.update(segment.as_bytes());
        }

        xml.push('\n');
        hasher.update(b"\n");

        index += 1;
        if index < input_bytes.len() && input_bytes[index] == b'\n' {
            index += 1;
        }

        segment_start = index;
    }

    if segment_start < input_bytes.len() {
        let segment = &input[segment_start..];
        xml.push_str(segment);
        hasher.update(segment.as_bytes());
    }

    NormalizedSourceXml {
        xml,
        source_hash: finish_sha256_hex(hasher),
    }
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

/// Legacy Entity.ID values that still require dbfId fallback resolution.
fn is_legacy_entity_dbf_id(value: Option<&str>) -> bool {
    matches!(value.map(str::trim), None | Some("0"))
}

/// Legacy card ids whose Entity nodes omit the ID attribute.
pub fn collect_legacy_entity_card_ids(xml: &str) -> Result<Vec<String>, String> {
    let NormalizedSourceXml {
        xml: normalized_xml,
        ..
    } = normalize_source_xml(xml);
    let mut reader = Reader::from_str(&normalized_xml);
    reader.config_mut().trim_text(false);

    let mut has_root = false;
    let mut entity_depth = 0usize;
    let mut card_ids = Vec::<String>::new();

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
                    continue;
                }

                if entity_depth == 0 && name != "Entity" {
                    continue;
                }

                if name == "Entity" {
                    entity_depth += 1;

                    if is_legacy_entity_dbf_id(attributes.get("ID").map(String::as_str)) {
                        let card_id = attributes.get("CardID").cloned().unwrap_or_default();
                        if card_id.is_empty() {
                            return Err("Entity.CardID is required".to_string());
                        }

                        card_ids.push(card_id);
                    }

                    continue;
                }

                if entity_depth > 0 {
                    entity_depth += 1;
                }
            }
            Ok(Event::Empty(event)) => {
                let name = decode_tag_name(event.name().as_ref());
                let attributes = decode_attributes(&reader, &event)?;

                if !has_root {
                    if name != "CardDefs" {
                        return Err(format!("Unexpected root tag: {name}"));
                    }

                    has_root = true;
                    continue;
                }

                if entity_depth == 0 && name != "Entity" {
                    continue;
                }

                if name == "Entity"
                    && is_legacy_entity_dbf_id(attributes.get("ID").map(String::as_str))
                {
                    let card_id = attributes.get("CardID").cloned().unwrap_or_default();
                    if card_id.is_empty() {
                        return Err("Entity.CardID is required".to_string());
                    }

                    card_ids.push(card_id);
                }
            }
            Ok(Event::End(_)) => {
                entity_depth = entity_depth.saturating_sub(1);
            }
            Ok(Event::Comment(_))
            | Ok(Event::Decl(_))
            | Ok(Event::PI(_))
            | Ok(Event::DocType(_))
            | Ok(Event::GeneralRef(_))
            | Ok(Event::Text(_))
            | Ok(Event::CData(_)) => {}
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Failed to parse CardDefs XML: {error}")),
        }
    }

    card_ids.sort();
    card_ids.dedup();
    Ok(card_ids)
}

/// Entity dbfId resolved from the XML attribute or a legacy cardId lookup map.
fn resolve_entity_dbf_id(
    entity: &XmlElement,
    card_id: &str,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<u32, String> {
    if let Some(value) = entity.attributes.get("ID").map(String::as_str) {
        let parsed = parse_u32(Some(value), "Entity.ID")?;
        if parsed > 0 {
            return Ok(parsed);
        }
    }

    if let Some(value) = dbf_id_by_card_id.get(card_id) {
        return Ok(*value);
    }

    // A small set of legacy hsdata entities never receives a positive dbfId in any scanned
    // CardDefs revision. Those rows intentionally keep dbfId 0 so the import can preserve the
    // historical entity instead of failing the whole sourceTag.
    Ok(0)
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

const JSON_ESCAPE_NONE: u8 = 0;
const JSON_ESCAPE_BACKSPACE: u8 = b'b';
const JSON_ESCAPE_TAB: u8 = b't';
const JSON_ESCAPE_LINE_FEED: u8 = b'n';
const JSON_ESCAPE_FORM_FEED: u8 = b'f';
const JSON_ESCAPE_CARRIAGE_RETURN: u8 = b'r';
const JSON_ESCAPE_QUOTE: u8 = b'"';
const JSON_ESCAPE_REVERSE_SOLIDUS: u8 = b'\\';
const JSON_ESCAPE_ASCII_CONTROL: u8 = b'u';

// Lookup table of escape sequences that matches serde_json string escaping.
const JSON_ESCAPE: [u8; 246] = [
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_BACKSPACE,
    JSON_ESCAPE_TAB,
    JSON_ESCAPE_LINE_FEED,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_FORM_FEED,
    JSON_ESCAPE_CARRIAGE_RETURN,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_ASCII_CONTROL,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_QUOTE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_REVERSE_SOLIDUS,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
    JSON_ESCAPE_NONE,
];

/// Escape marker that matches serde_json string escaping for one ASCII byte.
fn json_escape(byte: u8) -> u8 {
    match byte {
        b'\x08' => JSON_ESCAPE_BACKSPACE,
        b'\t' => JSON_ESCAPE_TAB,
        b'\n' => JSON_ESCAPE_LINE_FEED,
        b'\x0c' => JSON_ESCAPE_FORM_FEED,
        b'\r' => JSON_ESCAPE_CARRIAGE_RETURN,
        b'"' => JSON_ESCAPE_QUOTE,
        b'\\' => JSON_ESCAPE_REVERSE_SOLIDUS,
        0x00..=0x1f => JSON_ESCAPE_ASCII_CONTROL,
        _ => JSON_ESCAPE_NONE,
    }
}

/// ASCII control byte encoded into one `\u00XX` JSON escape sequence.
fn write_json_control_escape(output: &mut String, byte: u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.push('\\');
    output.push('u');
    output.push('0');
    output.push('0');
    output.push(HEX[(byte >> 4) as usize] as char);
    output.push(HEX[(byte & 0x0f) as usize] as char);
}

/// ASCII control byte hashed as one `\u00XX` JSON escape sequence.
fn write_json_control_escape_hash(hasher: &mut Sha256, byte: u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let escape = [
        b'\\',
        b'u',
        b'0',
        b'0',
        HEX[(byte >> 4) as usize],
        HEX[(byte & 0x0f) as usize],
    ];
    hasher.update(escape);
}

/// JSON string literal appended to the output buffer.
fn write_json_string(output: &mut String, value: &str) -> Result<(), String> {
    // Writing directly into the caller buffer avoids allocating a temporary
    // `serde_json::to_string(value)` result for every hot-path field.
    output.push('"');

    let bytes = value.as_bytes();
    let mut segment_start = 0usize;
    for index in 0..bytes.len() {
        let escape = json_escape(bytes[index]);
        if escape == JSON_ESCAPE_NONE {
            continue;
        }

        if segment_start < index {
            // Safety: the split point is always on ASCII bytes, so the slice stays valid UTF-8.
            output.push_str(unsafe { std::str::from_utf8_unchecked(&bytes[segment_start..index]) });
        }

        match escape {
            JSON_ESCAPE_BACKSPACE => output.push_str("\\b"),
            JSON_ESCAPE_TAB => output.push_str("\\t"),
            JSON_ESCAPE_LINE_FEED => output.push_str("\\n"),
            JSON_ESCAPE_FORM_FEED => output.push_str("\\f"),
            JSON_ESCAPE_CARRIAGE_RETURN => output.push_str("\\r"),
            JSON_ESCAPE_QUOTE => output.push_str("\\\""),
            JSON_ESCAPE_REVERSE_SOLIDUS => output.push_str("\\\\"),
            JSON_ESCAPE_ASCII_CONTROL => write_json_control_escape(output, bytes[index]),
            _ => unreachable!(),
        }

        segment_start = index + 1;
    }

    if segment_start < bytes.len() {
        // Safety: the split point is always on ASCII bytes, so the slice stays valid UTF-8.
        output.push_str(unsafe { std::str::from_utf8_unchecked(&bytes[segment_start..]) });
    }

    output.push('"');
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
fn serialize_canonical_json(value: &Value) -> Result<String, String> {
    let mut output = String::new();
    write_canonical_json(&mut output, value)?;
    Ok(output)
}

/// Canonical JSON string derived from one serde_json value.
#[cfg(test)]
fn canonical_json(value: &Value) -> Result<String, String> {
    serialize_canonical_json(value)
}

/// Canonical JSON hash derived from one serde_json value.
#[cfg(test)]
fn hash_canonical_json(value: &Value) -> Result<String, String> {
    canonical_json(value).map(|json| sha256_hex(&json))
}

/// JSON string literal encoded directly into one sha256 hasher.
fn write_json_string_hash(hasher: &mut Sha256, value: &str) -> Result<(), String> {
    // The hash path must consume the exact bytes `write_json_string` would emit, otherwise cached
    // canonical JSON and compatibility hashes would silently diverge.
    hasher.update(b"\"");

    let bytes = value.as_bytes();
    let mut segment_start = 0usize;
    for index in 0..bytes.len() {
        let escape = json_escape(bytes[index]);
        if escape == JSON_ESCAPE_NONE {
            continue;
        }

        if segment_start < index {
            hasher.update(&bytes[segment_start..index]);
        }

        match escape {
            JSON_ESCAPE_BACKSPACE => hasher.update(br#"\b"#),
            JSON_ESCAPE_TAB => hasher.update(br#"\t"#),
            JSON_ESCAPE_LINE_FEED => hasher.update(br#"\n"#),
            JSON_ESCAPE_FORM_FEED => hasher.update(br#"\f"#),
            JSON_ESCAPE_CARRIAGE_RETURN => hasher.update(br#"\r"#),
            JSON_ESCAPE_QUOTE => hasher.update(br#"\""#),
            JSON_ESCAPE_REVERSE_SOLIDUS => hasher.update(br#"\\"#),
            JSON_ESCAPE_ASCII_CONTROL => write_json_control_escape_hash(hasher, bytes[index]),
            _ => unreachable!(),
        }

        segment_start = index + 1;
    }

    if segment_start < bytes.len() {
        hasher.update(&bytes[segment_start..]);
    }

    hasher.update(b"\"");
    Ok(())
}

/// Locale maps serialized as canonical JSON objects.
fn localized_text_value(value: &LocalizedText) -> Value {
    let mut object = JsonMap::new();
    for (locale, text) in value {
        object.insert(locale.clone(), Value::String(text.clone()));
    }
    Value::Object(object)
}

/// Locale maps serialized directly into canonical JSON strings.
fn serialize_localized_text_json(value: &LocalizedText) -> Result<String, String> {
    let mut output = String::new();
    output.push('{');

    for (index, (locale, text)) in value.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        write_json_string(&mut output, locale)?;
        output.push(':');
        write_json_string(&mut output, text)?;
    }

    output.push('}');
    Ok(output)
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

    let raw_payload = Value::Object(raw_payload);
    // Cache the canonical JSON once per tag. Keeping only `raw_payload: Value` would force later
    // dedupe and serialization steps to walk the same tree again.
    let raw_payload_json = serialize_canonical_json(&raw_payload)?;
    let loc_string_value_json = match &loc_string_value {
        // `LocString` payloads are also embedded independently in snapshot hashing, so their bytes
        // are cached separately instead of being rebuilt from the locale map every time.
        Some(value) => Some(serialize_localized_text_json(value)?),
        None => None,
    };

    Ok(HsdataTagSnapshot {
        enum_id,
        raw_name,
        raw_type,
        raw_payload,
        raw_payload_json,
        raw_value,
        loc_string_value,
        loc_string_value_json,
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
#[cfg(test)]
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

/// Snapshot-hash tag payload encoded directly into one sha256 hasher.
fn write_snapshot_hash_tag(hasher: &mut Sha256, tag: &HsdataTagSnapshot) -> Result<(), String> {
    hasher.update(b"{");

    hasher.update(b"\"cardRefCardId\"");
    hasher.update(b":");
    match &tag.card_ref_card_id {
        Some(value) => write_json_string_hash(hasher, value)?,
        None => hasher.update(b"null"),
    }

    hasher.update(b",");
    hasher.update(b"\"enumId\"");
    hasher.update(b":");
    hasher.update(tag.enum_id.to_string().as_bytes());

    hasher.update(b",");
    hasher.update(b"\"locStringValue\"");
    hasher.update(b":");
    match &tag.loc_string_value_json {
        Some(value) => hasher.update(value.as_bytes()),
        None => hasher.update(b"null"),
    }

    hasher.update(b",");
    hasher.update(b"\"rawName\"");
    hasher.update(b":");
    write_json_string_hash(hasher, &tag.raw_name)?;

    hasher.update(b",");
    hasher.update(b"\"rawPayload\"");
    hasher.update(b":");
    hasher.update(tag.raw_payload_json.as_bytes());

    hasher.update(b",");
    hasher.update(b"\"rawType\"");
    hasher.update(b":");
    write_json_string_hash(hasher, &tag.raw_type)?;

    hasher.update(b",");
    hasher.update(b"\"rawValue\"");
    hasher.update(b":");
    match &tag.raw_value {
        Some(value) => write_json_string_hash(hasher, value)?,
        None => hasher.update(b"null"),
    }

    hasher.update(b",");
    hasher.update(b"\"tagOrder\"");
    hasher.update(b":");
    hasher.update(tag.tag_order.to_string().as_bytes());

    hasher.update(b"}");
    Ok(())
}

/// Snapshot hash derived from one normalized entity snapshot without building a Value tree.
///
/// Production dedupe no longer calls this path, but tests keep it as the byte-compatibility
/// reference for the cached canonical JSON optimization.
fn hash_snapshot_entity(entity: &HsdataEntitySnapshot) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(b"{");

    hasher.update(b"\"cardId\"");
    hasher.update(b":");
    write_json_string_hash(&mut hasher, &entity.card_id)?;

    hasher.update(b",");
    hasher.update(b"\"dbfId\"");
    hasher.update(b":");
    hasher.update(entity.dbf_id.to_string().as_bytes());

    hasher.update(b",");
    hasher.update(b"\"entityXmlVersion\"");
    hasher.update(b":");
    hasher.update(entity.entity_xml_version.to_string().as_bytes());

    hasher.update(b",");
    hasher.update(b"\"extraPayload\"");
    hasher.update(b":");
    hasher.update(entity.extra_payload_json.as_bytes());

    hasher.update(b",");
    hasher.update(b"\"tags\"");
    hasher.update(b":[");
    for (index, tag) in entity.tags.iter().enumerate() {
        if index > 0 {
            hasher.update(b",");
        }
        write_snapshot_hash_tag(&mut hasher, tag)?;
    }
    hasher.update(b"]}");

    Ok(finish_sha256_hex(hasher))
}

/// Normalized Entity nodes plus snapshot hashes derived from their canonical payloads.
fn normalize_entity_snapshot(
    entity: &XmlElement,
    profile: &mut HsdataParseXmlAccumulator,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<HsdataEntitySnapshot, String> {
    let card_id = entity.attributes.get("CardID").cloned().unwrap_or_default();
    if card_id.is_empty() {
        return Err("Entity.CardID is required".to_string());
    }

    let dbf_id = resolve_entity_dbf_id(entity, &card_id, dbf_id_by_card_id)?;
    let entity_xml_version = parse_u32(
        entity.attributes.get("version").map(String::as_str),
        "Entity.version",
    )?;
    let normalize_tags_started_at = Instant::now();
    let tags = get_elements(entity, "Tag")
        .into_iter()
        .enumerate()
        .map(|(index, tag)| normalize_raw_tag(tag, index))
        .collect::<Result<Vec<_>, _>>()?;
    add_elapsed_nanos(&mut profile.normalize_tags_ns, &normalize_tags_started_at);
    profile.tag_count += tags.len();
    profile.loc_string_tag_count += tags
        .iter()
        .filter(|tag| tag.loc_string_value.is_some())
        .count();

    let normalize_extra_payload_started_at = Instant::now();
    let extra_payload = normalize_extra_payload(entity)?;
    let extra_payload_json = serialize_canonical_json(&extra_payload)?;
    add_elapsed_nanos(
        &mut profile.normalize_extra_payload_ns,
        &normalize_extra_payload_started_at,
    );

    let mut snapshot = HsdataEntitySnapshot {
        card_id,
        dbf_id,
        entity_xml_version,
        tags,
        extra_payload,
        extra_payload_json,
        serialized_json: String::new(),
    };
    let serialize_snapshot_json_started_at = Instant::now();
    // Serialize eagerly even though chunking happens later. The same canonical bytes are reused by
    // dedupe and chunk assembly, so paying once here is cheaper than reserializing per phase.
    snapshot.serialized_json = serialize_snapshot_json(&snapshot)?;
    add_elapsed_nanos(
        &mut profile.serialize_snapshot_json_ns,
        &serialize_snapshot_json_started_at,
    );
    Ok(snapshot)
}

/// Duplicate card ids reduced to one snapshot or rejected when payloads conflict.
fn validate_and_dedupe_entities(
    entities: Vec<HsdataEntitySnapshot>,
) -> Result<Vec<HsdataEntitySnapshot>, String> {
    let mut by_card_id = HashMap::<String, usize>::new();
    let mut deduped = Vec::new();

    for entity in entities {
        match by_card_id.get(&entity.card_id) {
            None => {
                by_card_id.insert(entity.card_id.clone(), deduped.len());
                deduped.push(entity);
            }
            // Equality is all this step needs. Comparing cached canonical JSON avoids computing a
            // second local snapshot hash that would traverse the same payload again.
            Some(existing_index)
                if deduped
                    .get(*existing_index)
                    .is_some_and(|existing| existing.serialized_json == entity.serialized_json) => {
            }
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
    profile: &mut HsdataParseXmlAccumulator,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<(), String> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(XmlChild::Element(node));
        return Ok(());
    }

    if node.name != "Entity" {
        return Err(format!("Unexpected top-level closing tag: {}", node.name));
    }

    let normalize_entity_started_at = Instant::now();
    entities.push(normalize_entity_snapshot(
        &node,
        profile,
        dbf_id_by_card_id,
    )?);
    add_elapsed_nanos(
        &mut profile.normalize_entity_ns,
        &normalize_entity_started_at,
    );
    profile.parsed_entity_count += 1;
    Ok(())
}

/// CardDefs XML parsed into normalized entity snapshots.
/// CardDefs XML parsed into normalized entity snapshots with optional legacy dbfId fallbacks.
fn parse_hsdata_xml_with_dbf_ids(
    xml: &str,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<ParseHsdataXmlResult, String> {
    let total_started_at = Instant::now();
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    // Stream the document and only materialize the currently open `Entity` subtree. Building a
    // full DOM for CardDefs would add allocator pressure without helping later phases.
    let mut stack = Vec::<XmlElement>::new();
    let mut entities = Vec::<HsdataEntitySnapshot>::new();
    let mut build = None;
    let mut has_root = false;
    let mut profile = HsdataParseXmlAccumulator::default();

    loop {
        let read_event_started_at = Instant::now();
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                profile.start_event_count += 1;
                let name = decode_tag_name(event.name().as_ref());
                let decode_attributes_started_at = Instant::now();
                let attributes = decode_attributes(&reader, &event)?;
                add_elapsed_nanos(
                    &mut profile.decode_attributes_ns,
                    &decode_attributes_started_at,
                );
                profile.decoded_attribute_count += attributes.len();

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

                // Ignore non-Entity siblings at the CardDefs top level so they never enter the
                // temporary tree that feeds normalization.
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
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                profile.empty_event_count += 1;
                let name = decode_tag_name(event.name().as_ref());
                let decode_attributes_started_at = Instant::now();
                let attributes = decode_attributes(&reader, &event)?;
                add_elapsed_nanos(
                    &mut profile.decode_attributes_ns,
                    &decode_attributes_started_at,
                );
                profile.decoded_attribute_count += attributes.len();

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

                // Empty top-level nodes that are not entities are equally irrelevant to snapshots.
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
                    &mut profile,
                    dbf_id_by_card_id,
                )?;
            }
            Ok(Event::End(_)) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                profile.end_event_count += 1;
                if let Some(node) = stack.pop() {
                    finish_node(
                        &mut stack,
                        node,
                        &mut entities,
                        &mut profile,
                        dbf_id_by_card_id,
                    )?;
                }
            }
            Ok(Event::Text(event)) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                profile.text_event_count += 1;
                if let Some(node) = stack.last_mut() {
                    let decode_text_started_at = Instant::now();
                    let text = decode_text(event.as_ref())?;
                    add_elapsed_nanos(&mut profile.decode_text_ns, &decode_text_started_at);
                    if !text.is_empty() {
                        profile.decoded_text_node_count += 1;
                        profile.decoded_text_bytes += text.len();
                        node.children.push(XmlChild::Text(text));
                    }
                }
            }
            Ok(Event::CData(event)) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                profile.cdata_event_count += 1;
                if let Some(node) = stack.last_mut() {
                    let decode_text_started_at = Instant::now();
                    let text = String::from_utf8_lossy(event.as_ref()).into_owned();
                    add_elapsed_nanos(&mut profile.decode_text_ns, &decode_text_started_at);
                    if !text.is_empty() {
                        profile.decoded_text_node_count += 1;
                        profile.decoded_text_bytes += text.len();
                        node.children.push(XmlChild::Text(text));
                    }
                }
            }
            Ok(Event::Comment(_))
            | Ok(Event::Decl(_))
            | Ok(Event::PI(_))
            | Ok(Event::DocType(_))
            | Ok(Event::GeneralRef(_)) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
            }
            Ok(Event::Eof) => {
                add_elapsed_nanos(&mut profile.read_event_ns, &read_event_started_at);
                break;
            }
            Err(error) => return Err(format!("Failed to parse CardDefs XML: {error}")),
        }
    }

    let build = build.ok_or_else(|| "Missing CardDefs.build".to_string())?;
    if entities.is_empty() {
        return Err("CardDefs must contain at least one Entity".to_string());
    }

    let validate_dedupe_started_at = Instant::now();
    let entities = validate_and_dedupe_entities(entities)?;
    add_elapsed_nanos(&mut profile.validate_dedupe_ns, &validate_dedupe_started_at);
    profile.deduped_entity_count = entities.len();

    Ok(ParseHsdataXmlResult {
        document: ParsedHsdataDocument { build, entities },
        profile: profile.finish(&total_started_at),
    })
}

/// CardDefs XML parsed into normalized entity snapshots without legacy dbfId fallbacks.
fn parse_hsdata_xml(xml: &str) -> Result<ParseHsdataXmlResult, String> {
    let dbf_id_by_card_id = HashMap::new();
    parse_hsdata_xml_with_dbf_ids(xml, &dbf_id_by_card_id)
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
    output.push_str(&tag.raw_payload_json);
    output.push(',');
    output.push_str("\"rawValue\":");
    match &tag.raw_value {
        Some(value) => write_json_string(output, value)?,
        None => output.push_str("null"),
    }
    output.push(',');
    output.push_str("\"locStringValue\":");
    match &tag.loc_string_value_json {
        Some(value) => output.push_str(value),
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

/// Canonical snapshot JSON serialized into the provided buffer.
fn write_snapshot_json(output: &mut String, entity: &HsdataEntitySnapshot) -> Result<(), String> {
    output.push('{');
    output.push_str("\"cardId\":");
    write_json_string(output, &entity.card_id)?;
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
        write_tag_record(output, tag)?;
    }
    output.push(']');
    output.push(',');
    output.push_str("\"extraPayload\":");
    output.push_str(&entity.extra_payload_json);
    output.push('}');
    Ok(())
}

/// Canonical snapshot JSON serialized from one normalized entity snapshot.
fn serialize_snapshot_json(entity: &HsdataEntitySnapshot) -> Result<String, String> {
    let mut output = String::new();
    write_snapshot_json(&mut output, entity)?;
    Ok(output)
}

/// Finalized NDJSON chunk built from the accumulated buffer and incremental hash.
fn finish_chunk(
    chunk_index: usize,
    entity_count: usize,
    ndjson: String,
    hasher: Sha256,
) -> Result<HsdataPreparedPayloadChunk, String> {
    Ok(HsdataPreparedPayloadChunk {
        chunk_index: u32::try_from(chunk_index)
            .map_err(|_| "Too many NDJSON chunks to index".to_string())?,
        entity_count: u32::try_from(entity_count)
            .map_err(|_| "Too many entities inside one NDJSON chunk".to_string())?,
        payload_hash: finish_sha256_hex(hasher),
        ndjson,
    })
}

/// Initial String capacity reserved for one in-progress NDJSON chunk.
fn chunk_buffer_capacity(max_bytes_per_chunk: usize) -> usize {
    // Large server chunk limits do not need equally large local preallocation. A modest cap keeps
    // heap growth predictable while still avoiding repeated small reallocations.
    max_bytes_per_chunk.min(64 * 1024)
}

/// Canonical NDJSON chunks built from one normalized entity list.
fn build_chunks(
    entities: &[HsdataEntitySnapshot],
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
) -> Result<BuildChunksResult, String> {
    if max_bytes_per_chunk == 0 {
        return Err("max_bytes_per_chunk must be greater than 0".to_string());
    }

    if max_entities_per_chunk == 0 {
        return Err("max_entities_per_chunk must be greater than 0".to_string());
    }

    let chunk_capacity = chunk_buffer_capacity(max_bytes_per_chunk);
    let mut chunks = Vec::new();
    let mut profile = HsdataBuildChunksAccumulator::default();
    let mut current_ndjson = String::with_capacity(chunk_capacity);
    let mut current_entity_count = 0usize;
    let mut current_hasher = Sha256::new();
    let mut line = String::new();

    for entity in entities {
        let materialize_line_started_at = Instant::now();
        line.clear();
        if entity.serialized_json.is_empty() {
            // The normal hot path reuses the cached entity JSON. The fallback keeps the builder
            // correct for tests or future callers that construct snapshots manually.
            write_snapshot_json(&mut line, entity)?;
        } else {
            line.push_str(&entity.serialized_json);
        }
        line.push('\n');
        add_elapsed_nanos(
            &mut profile.materialize_line_ns,
            &materialize_line_started_at,
        );
        profile.serialized_line_count += 1;
        profile.serialized_line_bytes += line.len();
        let line_bytes = line.len();

        if line_bytes > max_bytes_per_chunk {
            return Err(format!(
                "Entity {} exceeds max_bytes_per_chunk",
                entity.card_id
            ));
        }

        let should_flush = current_entity_count > 0
            && (current_entity_count >= max_entities_per_chunk
                || current_ndjson.len() + line_bytes > max_bytes_per_chunk);

        if should_flush {
            let flush_chunk_started_at = Instant::now();
            chunks.push(finish_chunk(
                chunks.len(),
                current_entity_count,
                std::mem::take(&mut current_ndjson),
                std::mem::replace(&mut current_hasher, Sha256::new()),
            )?);
            add_elapsed_nanos(&mut profile.flush_chunk_ns, &flush_chunk_started_at);
            current_ndjson = String::with_capacity(chunk_capacity);
            current_entity_count = 0;
        }

        let update_chunk_hash_started_at = Instant::now();
        // Hash each line incrementally as it is appended. Rehashing the full chunk buffer at flush
        // time would scale with accumulated chunk size instead of the new line size.
        current_hasher.update(line.as_bytes());
        add_elapsed_nanos(
            &mut profile.update_chunk_hash_ns,
            &update_chunk_hash_started_at,
        );
        let append_chunk_started_at = Instant::now();
        current_ndjson.push_str(&line);
        add_elapsed_nanos(&mut profile.append_chunk_ns, &append_chunk_started_at);
        current_entity_count += 1;
    }

    if current_entity_count > 0 {
        let flush_chunk_started_at = Instant::now();
        chunks.push(finish_chunk(
            chunks.len(),
            current_entity_count,
            current_ndjson,
            current_hasher,
        )?);
        add_elapsed_nanos(&mut profile.flush_chunk_ns, &flush_chunk_started_at);
    }

    if chunks.is_empty() {
        return Err("No hsdata entities were prepared for import".to_string());
    }

    Ok(BuildChunksResult {
        chunks,
        profile: profile.finish(),
    })
}

/// Entity batches built from one normalized entity list for the local streaming path.
fn build_entity_batches(
    entities: Vec<HsdataEntitySnapshot>,
    max_bytes_per_batch: usize,
    max_entities_per_batch: usize,
) -> Result<BuildEntityBatchesResult, String> {
    if max_bytes_per_batch == 0 {
        return Err("max_bytes_per_batch must be greater than 0".to_string());
    }

    if max_entities_per_batch == 0 {
        return Err("max_entities_per_batch must be greater than 0".to_string());
    }

    let mut batches = Vec::new();
    let mut current_entities = Vec::new();
    let mut current_bytes = 0usize;

    for entity in entities {
        let entity_bytes = if entity.serialized_json.is_empty() {
            serialize_snapshot_json(&entity)?.len() + 1
        } else {
            entity.serialized_json.len() + 1
        };

        if entity_bytes > max_bytes_per_batch {
            return Err(format!(
                "Entity {} exceeds max_bytes_per_batch",
                entity.card_id
            ));
        }

        let should_flush = !current_entities.is_empty()
            && (current_entities.len() >= max_entities_per_batch
                || current_bytes + entity_bytes > max_bytes_per_batch);

        if should_flush {
            let batch_index = u32::try_from(batches.len())
                .map_err(|_| "Too many hsdata entity batches to index".to_string())?;
            let entity_count = u32::try_from(current_entities.len())
                .map_err(|_| "Too many entities inside one streaming batch".to_string())?;
            batches.push(HsdataEntityBatch {
                batch_index,
                entity_count,
                estimated_bytes: current_bytes,
                entities: current_entities,
            });
            current_entities = Vec::new();
            current_bytes = 0;
        }

        current_bytes += entity_bytes;
        current_entities.push(entity);
    }

    if !current_entities.is_empty() {
        let batch_index = u32::try_from(batches.len())
            .map_err(|_| "Too many hsdata entity batches to index".to_string())?;
        let entity_count = u32::try_from(current_entities.len())
            .map_err(|_| "Too many entities inside one streaming batch".to_string())?;
        batches.push(HsdataEntityBatch {
            batch_index,
            entity_count,
            estimated_bytes: current_bytes,
            entities: current_entities,
        });
    }

    if batches.is_empty() {
        return Err("No hsdata entities were prepared for import".to_string());
    }

    Ok(BuildEntityBatchesResult { batches })
}

/// Canonical NDJSON chunks prepared from one hsdata CardDefs XML payload.
pub fn prepare_hsdata_payload(
    xml: &str,
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
) -> Result<HsdataPreparedPayload, String> {
    let dbf_id_by_card_id = HashMap::new();
    prepare_hsdata_payload_with_dbf_ids(
        xml,
        max_bytes_per_chunk,
        max_entities_per_chunk,
        &dbf_id_by_card_id,
    )
}

/// Canonical NDJSON payload and profiling prepared from one hsdata CardDefs XML payload.
pub fn prepare_hsdata_payload_profiled(
    xml: &str,
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
) -> Result<HsdataPreparedPayloadResult, String> {
    let dbf_id_by_card_id = HashMap::new();
    prepare_hsdata_payload_profiled_with_dbf_ids(
        xml,
        max_bytes_per_chunk,
        max_entities_per_chunk,
        &dbf_id_by_card_id,
    )
}

/// Canonical NDJSON chunks prepared with optional legacy dbfId fallbacks.
pub fn prepare_hsdata_payload_with_dbf_ids(
    xml: &str,
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<HsdataPreparedPayload, String> {
    prepare_hsdata_payload_profiled_with_dbf_ids(
        xml,
        max_bytes_per_chunk,
        max_entities_per_chunk,
        dbf_id_by_card_id,
    )
    .map(|result| result.payload)
}

/// Canonical NDJSON payload and profiling prepared with optional legacy dbfId fallbacks.
pub fn prepare_hsdata_payload_profiled_with_dbf_ids(
    xml: &str,
    max_bytes_per_chunk: usize,
    max_entities_per_chunk: usize,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<HsdataPreparedPayloadResult, String> {
    let total_started_at = Instant::now();

    let normalize_xml_started_at = Instant::now();
    let NormalizedSourceXml {
        xml: normalized_xml,
        source_hash,
    } = normalize_source_xml(xml);
    let normalize_xml_ms = elapsed_millis(&normalize_xml_started_at);

    let parse_xml_started_at = Instant::now();
    let ParseHsdataXmlResult {
        document: parsed,
        profile: parse_xml_profile,
    } = parse_hsdata_xml_with_dbf_ids(&normalized_xml, dbf_id_by_card_id)?;
    let parse_xml_ms = elapsed_millis(&parse_xml_started_at);

    let build_chunks_started_at = Instant::now();
    let BuildChunksResult {
        chunks,
        profile: build_chunks_profile,
    } = build_chunks(
        &parsed.entities,
        max_bytes_per_chunk,
        max_entities_per_chunk,
    )?;
    let build_chunks_ms = elapsed_millis(&build_chunks_started_at);
    let total_entity_count = u32::try_from(parsed.entities.len())
        .map_err(|_| "Too many hsdata entities to count".to_string())?;
    let chunk_count =
        u32::try_from(chunks.len()).map_err(|_| "Too many hsdata chunks to count".to_string())?;

    // The profile field stays for log compatibility even though `normalize_source_xml` already
    // computed `source_hash`, so the dedicated hash phase now intentionally measures as zero.
    let compute_source_hash_started_at = Instant::now();
    let compute_source_hash_ms = elapsed_millis(&compute_source_hash_started_at);

    Ok(HsdataPreparedPayloadResult {
        payload: HsdataPreparedPayload {
            build: parsed.build,
            source_hash,
            payload_format_version: HSDATA_PAYLOAD_FORMAT_VERSION.to_string(),
            payload_encoding: HSDATA_PAYLOAD_ENCODING.to_string(),
            import_engine_version: HSDATA_IMPORT_ENGINE_VERSION.to_string(),
            total_entity_count,
            chunks,
        },
        profile: HsdataPreparedPayloadProfile {
            normalized_xml_bytes: normalized_xml.len(),
            total_entity_count,
            chunk_count,
            normalize_xml_ms,
            parse_xml_ms,
            parse_xml_profile,
            build_chunks_ms,
            build_chunks_profile,
            compute_source_hash_ms,
            total_ms: elapsed_millis(&total_started_at),
        },
    })
}

/// Entity batches and profiling prepared with optional legacy dbfId fallbacks.
pub fn prepare_hsdata_stream_with_dbf_ids(
    xml: &str,
    max_bytes_per_batch: usize,
    max_entities_per_batch: usize,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<HsdataPreparedStreamResult, String> {
    let total_started_at = Instant::now();

    let normalize_xml_started_at = Instant::now();
    let NormalizedSourceXml {
        xml: normalized_xml,
        source_hash,
    } = normalize_source_xml(xml);
    let normalize_xml_ms = elapsed_millis(&normalize_xml_started_at);

    let parse_xml_started_at = Instant::now();
    let ParseHsdataXmlResult {
        document: parsed,
        profile: parse_xml_profile,
    } = parse_hsdata_xml_with_dbf_ids(&normalized_xml, dbf_id_by_card_id)?;
    let parse_xml_ms = elapsed_millis(&parse_xml_started_at);

    let build_batches_started_at = Instant::now();
    let total_entity_count = u32::try_from(parsed.entities.len())
        .map_err(|_| "Too many hsdata entities to count".to_string())?;
    let BuildEntityBatchesResult { batches } =
        build_entity_batches(parsed.entities, max_bytes_per_batch, max_entities_per_batch)?;
    let split_batches_ms = elapsed_millis(&build_batches_started_at);
    let batch_count = u32::try_from(batches.len())
        .map_err(|_| "Too many hsdata entity batches to count".to_string())?;

    Ok(HsdataPreparedStreamResult {
        source: HsdataPreparedStream {
            build: parsed.build,
            source_hash,
            payload_encoding: HSDATA_PAYLOAD_ENCODING.to_string(),
            import_engine_version: HSDATA_IMPORT_ENGINE_VERSION.to_string(),
            total_entity_count,
        },
        batches,
        profile: HsdataPreparedStreamProfile {
            normalized_xml_bytes: normalized_xml.len(),
            total_entity_count,
            batch_count,
            normalize_xml_ms,
            parse_xml_ms,
            parse_xml_profile,
            split_batches_ms,
            total_ms: elapsed_millis(&total_started_at),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::{
        collect_legacy_entity_card_ids, hash_canonical_json, hash_snapshot_entity,
        parse_hsdata_xml, prepare_hsdata_payload, prepare_hsdata_payload_profiled,
        prepare_hsdata_payload_with_dbf_ids, prepare_hsdata_stream_with_dbf_ids, sha256_hex,
        snapshot_hash_value, write_json_string, write_json_string_hash, Digest, Sha256,
        HSDATA_IMPORT_ENGINE_VERSION, HSDATA_PAYLOAD_ENCODING, HSDATA_PAYLOAD_FORMAT_VERSION,
    };
    use std::collections::HashMap;

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

    /// Entity batches keep batch boundaries stable for the local streaming import path.
    #[test]
    fn splits_entity_batches_by_entity_limit() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\"><Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/></Entity>",
            "<Entity CardID=\"CARD_002\" ID=\"2\" version=\"1\"><Tag enumID=\"2\" name=\"TWO\" type=\"String\" value=\"def\"/></Entity>",
            "</CardDefs>",
        );

        let prepared =
            prepare_hsdata_stream_with_dbf_ids(xml, usize::MAX, 1, &HashMap::new()).unwrap();

        assert_eq!(prepared.source.build, 7);
        assert_eq!(prepared.source.source_hash, sha256_hex(xml));
        assert_eq!(prepared.source.payload_encoding, HSDATA_PAYLOAD_ENCODING);
        assert_eq!(
            prepared.source.import_engine_version,
            HSDATA_IMPORT_ENGINE_VERSION
        );
        assert_eq!(prepared.source.total_entity_count, 2);
        assert_eq!(prepared.profile.batch_count, 2);
        assert_eq!(prepared.batches.len(), 2);
        assert_eq!(prepared.batches[0].batch_index, 0);
        assert_eq!(prepared.batches[0].entity_count, 1);
        assert_eq!(prepared.batches[0].entities[0].card_id, "CARD_001");
        assert_eq!(prepared.batches[1].batch_index, 1);
        assert_eq!(prepared.batches[1].entity_count, 1);
        assert_eq!(prepared.batches[1].entities[0].card_id, "CARD_002");
    }

    /// Source hashes are computed from canonical XML line endings and without a BOM.
    #[test]
    fn normalizes_source_hash_input() {
        let canonical = concat!(
            "<CardDefs build=\"7\">\n",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\">\n",
            "<Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/>\n",
            "</Entity>\n",
            "</CardDefs>",
        );
        let windows = canonical.replace('\n', "\r\n");
        let xml = format!("\u{feff}{windows}");

        let prepared = prepare_hsdata_payload(&xml, usize::MAX, usize::MAX).unwrap();

        assert_eq!(prepared.source_hash, sha256_hex(canonical));
    }

    /// Legacy CardDefs revisions report the card ids that still need dbfId fallbacks.
    #[test]
    fn collects_legacy_entity_card_ids_for_missing_dbf_ids() {
        let xml = concat!(
            "<CardDefs build=\"10784\">",
            "<Entity CardID=\"AT_001\" version=\"2\"></Entity>",
            "<Entity CardID=\"AT_002\" ID=\"2\" version=\"2\"></Entity>",
            "</CardDefs>",
        );

        let card_ids = collect_legacy_entity_card_ids(xml).unwrap();
        assert_eq!(card_ids, vec!["AT_001".to_string()]);
    }

    /// Zero dbfId values follow the same legacy fallback path as missing Entity.ID values.
    #[test]
    fn collects_legacy_entity_card_ids_for_zero_dbf_ids() {
        let xml = concat!(
            "<CardDefs build=\"10784\">",
            "<Entity CardID=\"AT_001\" ID=\"0\" version=\"2\"></Entity>",
            "<Entity CardID=\"AT_002\" ID=\"2\" version=\"2\"></Entity>",
            "</CardDefs>",
        );

        let card_ids = collect_legacy_entity_card_ids(xml).unwrap();
        assert_eq!(card_ids, vec!["AT_001".to_string()]);
    }

    /// Legacy Entity nodes can reuse dbfId values supplied by a cardId lookup map.
    #[test]
    fn prepares_payload_with_legacy_dbf_id_fallback() {
        let xml = concat!(
            "<CardDefs build=\"10784\">",
            "<Entity CardID=\"AT_001\" version=\"2\"><Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/></Entity>",
            "</CardDefs>",
        );
        let dbf_id_by_card_id = HashMap::from([(String::from("AT_001"), 1u32)]);

        let prepared =
            prepare_hsdata_payload_with_dbf_ids(xml, usize::MAX, usize::MAX, &dbf_id_by_card_id)
                .unwrap();

        assert_eq!(prepared.build, 10784);
        assert_eq!(prepared.total_entity_count, 1);
        assert!(prepared.chunks[0].ndjson.contains("\"cardId\":\"AT_001\""));
        assert!(prepared.chunks[0].ndjson.contains("\"dbfId\":1"));
    }

    /// Zero dbfId values still resolve through the legacy cardId lookup map.
    #[test]
    fn prepares_payload_with_zero_dbf_id_fallback() {
        let xml = concat!(
            "<CardDefs build=\"10784\">",
            "<Entity CardID=\"AT_001\" ID=\"0\" version=\"2\"><Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/></Entity>",
            "</CardDefs>",
        );
        let dbf_id_by_card_id = HashMap::from([(String::from("AT_001"), 1u32)]);

        let prepared =
            prepare_hsdata_payload_with_dbf_ids(xml, usize::MAX, usize::MAX, &dbf_id_by_card_id)
                .unwrap();

        assert!(prepared.chunks[0].ndjson.contains("\"cardId\":\"AT_001\""));
        assert!(prepared.chunks[0].ndjson.contains("\"dbfId\":1"));
    }

    /// Chunk hashes remain stable when multiple entity lines share one chunk.
    #[test]
    fn preserves_chunk_hash_for_multi_entity_chunk() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\"><Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/></Entity>",
            "<Entity CardID=\"CARD_002\" ID=\"2\" version=\"1\"><Tag enumID=\"2\" name=\"TWO\" type=\"String\" value=\"def\"/></Entity>",
            "</CardDefs>",
        );

        let prepared = prepare_hsdata_payload(xml, usize::MAX, usize::MAX).unwrap();
        let expected_ndjson = concat!(
            "{\"cardId\":\"CARD_001\",\"dbfId\":1,\"entityXmlVersion\":1,\"tags\":[",
            "{\"enumId\":1,\"rawName\":\"ONE\",\"rawType\":\"String\",\"rawPayload\":{\"attributes\":{\"enumID\":\"1\",\"name\":\"ONE\",\"type\":\"String\",\"value\":\"abc\"}},\"rawValue\":\"abc\",\"locStringValue\":null,\"cardRefCardId\":null,\"tagOrder\":0}",
            "],\"extraPayload\":{\"entourageCards\":[],\"masterPowers\":[],\"powers\":[],\"referencedTags\":{},\"triggeredPowerHistoryInfo\":[]}}\n",
            "{\"cardId\":\"CARD_002\",\"dbfId\":2,\"entityXmlVersion\":1,\"tags\":[",
            "{\"enumId\":2,\"rawName\":\"TWO\",\"rawType\":\"String\",\"rawPayload\":{\"attributes\":{\"enumID\":\"2\",\"name\":\"TWO\",\"type\":\"String\",\"value\":\"def\"}},\"rawValue\":\"def\",\"locStringValue\":null,\"cardRefCardId\":null,\"tagOrder\":0}",
            "],\"extraPayload\":{\"entourageCards\":[],\"masterPowers\":[],\"powers\":[],\"referencedTags\":{},\"triggeredPowerHistoryInfo\":[]}}\n",
        );

        assert_eq!(prepared.chunks.len(), 1);
        assert_eq!(prepared.chunks[0].entity_count, 2);
        assert_eq!(prepared.chunks[0].ndjson, expected_ndjson);
        assert_eq!(prepared.chunks[0].payload_hash, sha256_hex(expected_ndjson));
    }

    /// Direct snapshot hashing stays byte-compatible with the canonical Value reference path.
    #[test]
    fn preserves_snapshot_hash_compatibility() {
        let xml = concat!(
            "<CardDefs build=\"7\">",
            "<Entity CardID=\"CARD_001\" ID=\"1\" version=\"1\">",
            "<Tag enumID=\"1\" name=\"ONE\" type=\"String\" value=\"abc\"/>",
            "<Tag enumID=\"2\" name=\"TEXT\" type=\"LocString\"><enUS>Hello</enUS><zhCN>你好</zhCN></Tag>",
            "<ReferencedTag enumID=\"3\" value=\"1\"/>",
            "<Power definition=\"POWER_001\"><PlayRequirement reqID=\"4\" param=\"5\"/></Power>",
            "<EntourageCard cardID=\"CARD_002\"/>",
            "<MasterPower>MASTER_001</MasterPower>",
            "<TriggeredPowerHistoryInfo effectIndex=\"-1\" showInHistory=\"true\"/>",
            "</Entity>",
            "</CardDefs>",
        );

        let parsed = parse_hsdata_xml(xml).unwrap();
        let entity = &parsed.document.entities[0];

        let expected = hash_canonical_json(&snapshot_hash_value(entity)).unwrap();
        let actual = hash_snapshot_entity(entity).unwrap();

        assert_eq!(actual, expected);
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

    /// Missing legacy dbfId fallbacks now preserve dbfId zero for unresolved historical rows.
    #[test]
    fn preserves_zero_for_legacy_entity_without_dbf_id_fallback() {
        let xml = concat!(
            "<CardDefs build=\"10784\">",
            "<Entity CardID=\"AT_001\" version=\"2\"></Entity>",
            "</CardDefs>",
        );

        let prepared = prepare_hsdata_payload(xml, usize::MAX, usize::MAX).unwrap();
        assert!(prepared.chunks[0].ndjson.contains("\"cardId\":\"AT_001\""));
        assert!(prepared.chunks[0].ndjson.contains("\"dbfId\":0"));
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
        assert!(prepared.chunks[0].ndjson.contains(
            "\"triggeredPowerHistoryInfo\":[{\"effectIndex\":-1,\"showInHistory\":true}]"
        ));
    }

    /// Profiled payload preparation reports stable phase counts for a simple source.
    #[test]
    fn profiles_payload_preparation() {
        let xml = r#"<CardDefs build="7"><Entity CardID="CARD_001" ID="1" version="1"><Tag enumID="1" name="ONE" type="String" value="abc"/></Entity></CardDefs>"#;
        let profiled = prepare_hsdata_payload_profiled(xml, usize::MAX, usize::MAX).unwrap();

        assert_eq!(profiled.payload.build, 7);
        assert_eq!(profiled.profile.total_entity_count, 1);
        assert_eq!(profiled.profile.chunk_count, 1);
        assert_eq!(profiled.profile.parse_xml_profile.parsed_entity_count, 1);
        assert_eq!(profiled.profile.parse_xml_profile.deduped_entity_count, 1);
        assert_eq!(profiled.profile.parse_xml_profile.tag_count, 1);
        assert!(profiled.profile.parse_xml_profile.start_event_count > 0);
        assert!(
            profiled.profile.parse_xml_profile.normalize_entity_ms
                >= profiled.profile.parse_xml_profile.snapshot_hash_ms
        );
        assert!(profiled.profile.normalized_xml_bytes > 0);
        assert!(profiled.profile.total_ms >= profiled.profile.normalize_xml_ms);
        assert!(profiled.profile.total_ms >= profiled.profile.parse_xml_ms);
        assert!(profiled.profile.total_ms >= profiled.profile.build_chunks_ms);
        assert!(profiled.profile.total_ms >= profiled.profile.compute_source_hash_ms);
    }

    /// JSON string escaping stays byte-compatible with serde_json.
    #[test]
    fn preserves_json_string_escaping() {
        let value = "quote:\" backslash:\\ newline:\n tab:\t control:\u{0008}";
        let mut output = String::new();
        write_json_string(&mut output, value).unwrap();
        let expected = serde_json::to_string(value).unwrap();

        let mut hasher = Sha256::new();
        write_json_string_hash(&mut hasher, value).unwrap();
        let actual_hash = super::finish_sha256_hex(hasher);
        let expected_hash = sha256_hex(&expected);

        assert_eq!(output, expected);
        assert_eq!(actual_hash, expected_hash);
    }
}
