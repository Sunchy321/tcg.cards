//! Minimal SeaORM bridge for the Hearthstone row families owned by hsdata publish.

use sea_orm::entity::prelude::*;

/// Stored `change_type` tokens used by the published Hearthstone rows.
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
// HACK: Keep the quoted schema-qualified enum name as a temporary workaround for SeaORM issue #2581 until upstream supports schema-aware ActiveEnum mapping.
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "hearthstone\".\"change_type"
)]
pub enum ChangeType {
    #[sea_orm(string_value = "unknown")]
    Unknown,
    #[sea_orm(string_value = "major")]
    Major,
    #[sea_orm(string_value = "minor")]
    Minor,
    #[sea_orm(string_value = "non-functional")]
    NonFunctional,
    #[sea_orm(string_value = "wording")]
    Wording,
    #[sea_orm(string_value = "bugged")]
    Bugged,
}

/// Stored `locale` tokens used by the published Hearthstone localizations.
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
// HACK: Keep the quoted schema-qualified enum name as a temporary workaround for SeaORM issue #2581 until upstream supports schema-aware ActiveEnum mapping.
#[sea_orm(
    rs_type = "String",
    db_type = "Enum",
    enum_name = "hearthstone\".\"locale"
)]
pub enum Locale {
    #[sea_orm(string_value = "en")]
    En,
    #[sea_orm(string_value = "de")]
    De,
    #[sea_orm(string_value = "zhs")]
    Zhs,
    #[sea_orm(string_value = "es")]
    Es,
    #[sea_orm(string_value = "zht")]
    Zht,
    #[sea_orm(string_value = "fr")]
    Fr,
    #[sea_orm(string_value = "it")]
    It,
    #[sea_orm(string_value = "ja")]
    Ja,
    #[sea_orm(string_value = "ko")]
    Ko,
    #[sea_orm(string_value = "mx")]
    Mx,
    #[sea_orm(string_value = "pl")]
    Pl,
    #[sea_orm(string_value = "pt")]
    Pt,
    #[sea_orm(string_value = "ru")]
    Ru,
    #[sea_orm(string_value = "ph")]
    Ph,
    #[sea_orm(string_value = "th")]
    Th,
    #[sea_orm(string_value = "he")]
    He,
    #[sea_orm(string_value = "ar")]
    Ar,
    #[sea_orm(string_value = "sa")]
    Sa,
    #[sea_orm(string_value = "grc")]
    Grc,
    #[sea_orm(string_value = "la")]
    La,
    #[sea_orm(string_value = "qya")]
    Qya,
}

/// SeaORM bridge for `hearthstone.cards`.
pub mod cards {
    use sea_orm::entity::prelude::*;

    /// One card row associated with a published Hearthstone card id.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
    #[sea_orm(schema_name = "hearthstone", table_name = "cards")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub card_id: String,
        #[sea_orm(column_type = "JsonBinary")]
        pub legalities: Json,
    }

    /// No relation helpers are required for publish-time row copying.
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM bridge for `hearthstone.entities`.
pub mod entities {
    use super::ChangeType;
    use sea_orm::entity::prelude::*;

    /// One latest or historical entity row published from hsdata projection output.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
    #[sea_orm(schema_name = "hearthstone", table_name = "entities")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub card_id: String,
        pub version: Vec<i32>,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub revision_hash: String,
        pub dbf_id: i32,
        #[sea_orm(column_type = "JsonBinary")]
        pub legacy_payload: Json,
        #[sea_orm(column_type = "Text")]
        pub set: String,
        pub class: Vec<String>,
        #[sea_orm(column_type = "Text")]
        pub r#type: String,
        pub cost: i32,
        pub attack: Option<i32>,
        pub health: Option<i32>,
        pub durability: Option<i32>,
        pub armor: Option<i32>,
        pub rune: Option<Vec<String>>,
        pub race: Option<Vec<String>>,
        #[sea_orm(column_type = "Text", nullable)]
        pub spell_school: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub quest_type: Option<String>,
        pub quest_progress: Option<i32>,
        pub quest_part: Option<i32>,
        #[sea_orm(column_type = "Text", nullable)]
        pub hero_power: Option<String>,
        pub tech_level: Option<i32>,
        pub in_bobs_tavern: bool,
        #[sea_orm(column_type = "Text", nullable)]
        pub triple_card: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub race_bucket: Option<String>,
        pub armor_bucket: Option<i32>,
        #[sea_orm(column_type = "Text", nullable)]
        pub buddy: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub banned_race: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub mercenary_role: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub mercenary_faction: Option<String>,
        pub colddown: Option<i32>,
        pub collectible: bool,
        pub elite: bool,
        #[sea_orm(column_type = "Text", nullable)]
        pub rarity: Option<String>,
        #[sea_orm(column_type = "Text")]
        pub artist: String,
        #[sea_orm(column_type = "Text", nullable)]
        pub override_watermark: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub faction: Option<String>,
        #[sea_orm(column_type = "JsonBinary")]
        pub mechanics: Json,
        #[sea_orm(column_type = "JsonBinary")]
        pub referenced_tags: Json,
        #[sea_orm(column_type = "Text")]
        pub text_builder_type: String,
        pub change_type: ChangeType,
        pub is_latest: bool,
    }

    /// No relation helpers are required for publish-time row copying.
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM bridge for `hearthstone.entity_localizations`.
pub mod entity_localizations {
    use super::{ChangeType, Locale};
    use sea_orm::entity::prelude::*;

    /// One latest or historical localization row published from hsdata projection output.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
    #[sea_orm(schema_name = "hearthstone", table_name = "entity_localizations")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub card_id: String,
        pub version: Vec<i32>,
        #[sea_orm(primary_key, auto_increment = false)]
        pub lang: Locale,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub revision_hash: String,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub localization_hash: String,
        #[sea_orm(column_type = "Text", nullable)]
        pub render_hash: Option<String>,
        #[sea_orm(column_type = "JsonBinary", nullable)]
        pub render_model: Option<Json>,
        pub is_latest: bool,
        #[sea_orm(column_type = "Text")]
        pub name: String,
        #[sea_orm(column_type = "Text")]
        pub text: String,
        #[sea_orm(column_type = "Text")]
        pub rich_text: String,
        #[sea_orm(column_type = "Text")]
        pub display_text: String,
        #[sea_orm(column_type = "Text", nullable)]
        pub target_text: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub text_in_play: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub how_to_earn: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub how_to_earn_golden: Option<String>,
        #[sea_orm(column_type = "Text", nullable)]
        pub flavor_text: Option<String>,
        pub loc_change_type: ChangeType,
    }

    /// No relation helpers are required for publish-time row copying.
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM bridge for `hearthstone.entity_relations`.
pub mod entity_relations {
    use sea_orm::entity::prelude::*;

    /// One latest or historical relation row published from hsdata projection output.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
    #[sea_orm(schema_name = "hearthstone", table_name = "entity_relations")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub source_id: String,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub source_revision_hash: String,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub relation: String,
        #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
        pub target_id: String,
        pub version: Vec<i32>,
        pub is_latest: bool,
    }

    /// No relation helpers are required for publish-time row copying.
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
