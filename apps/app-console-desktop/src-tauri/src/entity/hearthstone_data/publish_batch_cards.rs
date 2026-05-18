//! `SeaORM` Entity for one local hsdata publish batch card row.

use super::sea_orm_active_enums::PublishBatchCardAction;
use super::sea_orm_active_enums::PublishBatchCardStatus;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(schema_name = "hearthstone_data", table_name = "publish_batch_cards")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub batch_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub card_id: String,
    #[sea_orm(column_type = "Text")]
    pub entity_family_hash: String,
    #[sea_orm(column_type = "Text")]
    pub localization_family_hash: String,
    #[sea_orm(column_type = "Text")]
    pub relation_family_hash: String,
    #[sea_orm(column_type = "Text")]
    pub manifest_hash: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub previous_manifest_hash: Option<String>,
    pub action: PublishBatchCardAction,
    pub status: PublishBatchCardStatus,
    #[sea_orm(column_type = "Text", nullable)]
    pub error: Option<String>,
    pub entity_row_count: i32,
    pub localization_row_count: i32,
    pub relation_row_count: i32,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub applied_at: Option<DateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
