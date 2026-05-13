//! Handwritten module index that exposes only the generated modules that currently compile.
//!
//! The pulled `hearthstone` SeaORM output still contains generator issues for non-primary-key
//! tables and duplicated enum variants, so desktop Rust only exposes the `hearthstone_data`
//! module tree here for now. Cross-schema access to `hearthstone.tags` is routed through the
//! handwritten bridge under `hearthstone_data::tags`.

pub mod hearthstone_data;
