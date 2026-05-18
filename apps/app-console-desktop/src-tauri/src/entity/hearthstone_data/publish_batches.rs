//! `SeaORM` Entity for local hsdata publish batches.

use super::sea_orm_active_enums::PublishBatchStatus;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(schema_name = "hearthstone_data", table_name = "publish_batches")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub publish_target_id: String,
    #[sea_orm(column_type = "Text")]
    pub environment: String,
    #[sea_orm(column_type = "Text")]
    pub target_fingerprint: String,
    pub source_tag_min: i32,
    pub source_tag_max: i32,
    pub build_min: i32,
    pub build_max: i32,
    #[sea_orm(column_type = "Text")]
    pub manifest_hash: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub previous_manifest_hash: Option<String>,
    pub card_count: i32,
    pub changed_card_count: i32,
    pub inserted_card_count: i32,
    pub updated_card_count: i32,
    pub deleted_card_count: i32,
    pub unchanged_card_count: i32,
    pub status: PublishBatchStatus,
    #[sea_orm(column_type = "Text", nullable)]
    pub error: Option<String>,
    #[sea_orm(column_type = "JsonBinary", nullable)]
    pub summary: Option<Json>,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub started_at: Option<DateTime>,
    pub completed_at: Option<DateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
