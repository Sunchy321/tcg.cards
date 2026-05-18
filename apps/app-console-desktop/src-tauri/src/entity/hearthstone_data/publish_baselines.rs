//! `SeaORM` Entity for one local hsdata publish baseline row.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(schema_name = "hearthstone_data", table_name = "publish_baselines")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub publish_target_id: String,
    #[sea_orm(column_type = "Text")]
    pub environment: String,
    #[sea_orm(column_type = "Text")]
    pub target_fingerprint: String,
    pub batch_id: Uuid,
    pub source_tag_min: i32,
    pub source_tag_max: i32,
    pub build_min: i32,
    pub build_max: i32,
    #[sea_orm(column_type = "Text")]
    pub manifest_hash: String,
    pub card_count: i32,
    pub published_at: DateTime,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
