//! Handwritten bridge for the generated `hearthstone_data` module tree.
//!
//! SeaORM currently generates the `raw_entity_snapshot_tags` relation as `super::tags::Entity`
//! even though the referenced `tags` table lives in the separate `hearthstone` schema output.
//! Importing the pulled `hearthstone/tags.rs` file through this bridge keeps the generated
//! relation compiling without editing the pulled table files themselves.

#[path = "../hearthstone/tags.rs"]
mod generated_hearthstone_tags;

pub use generated_hearthstone_tags::*;
