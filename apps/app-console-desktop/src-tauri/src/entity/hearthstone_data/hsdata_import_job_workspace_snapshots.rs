//! `SeaORM` Entity for lightweight hsdata import workspace snapshots.

use sea_orm::entity::prelude::*;

/// Lightweight workspace row that tracks one finalized snapshot target for one job card.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(
    schema_name = "hearthstone_data",
    table_name = "hsdata_import_job_workspace_snapshots"
)]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub job_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(column_type = "Text")]
    pub card_id: String,
    pub chunk_index: i32,
    pub snapshot_id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub snapshot_hash: String,
    pub is_new_snapshot: bool,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

/// Lightweight workspace relations for one hsdata import job row.
#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::hsdata_import_jobs::Entity",
        from = "Column::JobId",
        to = "super::hsdata_import_jobs::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    HsdataImportJobs,
}

impl Related<super::hsdata_import_jobs::Entity> for Entity {
    /// Job relation used by workspace cleanup and sourceTag finalization.
    fn to() -> RelationDef {
        Relation::HsdataImportJobs.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
