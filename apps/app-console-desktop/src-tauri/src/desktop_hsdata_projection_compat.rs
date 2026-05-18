/// Legacy spell-school enum tokens indexed by hsdata integer value.
const SPELL_SCHOOL_BY_INT: &[(i32, &str)] = &[
    (1, "arcane"),
    (2, "fire"),
    (3, "frost"),
    (4, "nature"),
    (5, "holy"),
    (6, "shadow"),
    (7, "fel"),
    (8, "physical_combat"),
    (9, "tavern_spell"),
    (10, "spellcraft"),
    (11, "lesser_trinket"),
    (12, "greater_trinket"),
    (13, "upgrade"),
];

/// Legacy race enum tokens indexed by hsdata integer value.
const RACE_BY_INT: &[(i32, &str)] = &[
    (1, "bloodelf"),
    (2, "draenei"),
    (3, "dwarf"),
    (4, "gnome"),
    (5, "goblin"),
    (6, "human"),
    (7, "nightelf"),
    (8, "orc"),
    (9, "tauren"),
    (10, "troll"),
    (11, "undead"),
    (12, "worgen"),
    (13, "goblin2"),
    (14, "murloc"),
    (15, "demon"),
    (16, "scourge"),
    (17, "mech"),
    (18, "elemental"),
    (19, "ogre"),
    (20, "beast"),
    (21, "totem"),
    (22, "nerubian"),
    (23, "pirate"),
    (24, "dragon"),
    (25, "blank"),
    (26, "all"),
    (38, "egg"),
    (43, "quilboar"),
    (80, "centaur"),
    (81, "furbolg"),
    (83, "highelf"),
    (84, "treant"),
    (88, "halforc"),
    (89, "lock"),
    (92, "naga"),
    (93, "old_god"),
    (94, "pandaren"),
    (95, "gronn"),
    (96, "celestial"),
    (97, "gnoll"),
    (98, "golem"),
    (100, "vulpera"),
];

/// Legacy class bitmask tokens indexed by hsdata multiclass flag.
const CLASS_BY_MASK: &[(i32, &str)] = &[
    (1, "death_knight"),
    (2, "druid"),
    (4, "hunter"),
    (8, "mage"),
    (16, "paladin"),
    (32, "priest"),
    (64, "rogue"),
    (128, "shaman"),
    (256, "warlock"),
    (512, "warrior"),
    (1024, "dream"),
    (2048, "neutral"),
    (4096, "whizbang"),
    (8192, "demon_hunter"),
];

/// Legacy `type` enum tokens indexed by hsdata integer value.
const TYPE_BY_INT: &[(i32, &str)] = &[
    (0, "null"),
    (4, "minion"),
    (5, "spell"),
    (7, "weapon"),
    (10, "hero_power"),
];

/// Legacy `rarity` enum tokens indexed by hsdata integer value.
const RARITY_BY_INT: &[(i32, &str)] = &[
    (0, "unknown"),
    (1, "common"),
    (2, "free"),
    (3, "rare"),
    (4, "epic"),
    (5, "legendary"),
];

/// Enum token looked up from one compact integer-to-token table.
fn enum_token_by_int(entries: &'static [(i32, &'static str)], value: i32) -> Option<&'static str> {
    entries
        .iter()
        .find_map(|(candidate, token)| (*candidate == value).then_some(*token))
}

/// Spell-school token resolved from one legacy integer enum value.
pub(crate) fn spell_school_token_by_int(value: i32) -> Option<&'static str> {
    enum_token_by_int(SPELL_SCHOOL_BY_INT, value)
}

/// Race token resolved from one legacy integer enum value.
pub(crate) fn race_token_by_int(value: i32) -> Option<&'static str> {
    enum_token_by_int(RACE_BY_INT, value)
}

/// Class tokens resolved from one multiclass bitmask value.
pub(crate) fn class_tokens_by_mask(value: i32) -> Vec<String> {
    CLASS_BY_MASK
        .iter()
        .filter_map(|(bit, token)| ((value & *bit) != 0).then_some((*token).to_string()))
        .collect()
}

/// Known scalar enum token resolved for one built-in target field.
pub(crate) fn known_scalar_enum_token_by_int(target: &str, value: i32) -> Option<&'static str> {
    match target {
        "type" => enum_token_by_int(TYPE_BY_INT, value),
        "rarity" => enum_token_by_int(RARITY_BY_INT, value),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        class_tokens_by_mask, known_scalar_enum_token_by_int, race_token_by_int,
        spell_school_token_by_int,
    };

    /// Legacy multiclass flags still expand into the expected class tokens.
    #[test]
    fn class_tokens_by_mask_reads_known_flags() {
        assert_eq!(
            class_tokens_by_mask(2056),
            vec!["mage".to_string(), "neutral".to_string()]
        );
    }

    /// Legacy scalar enum compat tables still resolve the expected output tokens.
    #[test]
    fn scalar_compat_tables_resolve_known_tokens() {
        assert_eq!(spell_school_token_by_int(2), Some("fire"));
        assert_eq!(race_token_by_int(24), Some("dragon"));
        assert_eq!(known_scalar_enum_token_by_int("type", 4), Some("minion"));
        assert_eq!(known_scalar_enum_token_by_int("rarity", 3), Some("rare"));
    }
}
