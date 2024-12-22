export default {
    type: {
        minion:            'Minion',
        spell:             'Spell',
        weapon:            'Weapon',
        hero:              'Hero',
        hero_power:        'Hero Power',
        enchantment:       'Enchantment',
        mercenary_ability: 'Mercenary Ability',
        location:          'Location',
        tavern_spell:      'Tavern Spell',
        anomaly:           'Anomaly',
    },

    race: {
        all:       'All',
        beast:     'Beast',
        blank:     'Blank',
        bloodelf:  'Bloodelf',
        centaur:   'Centaur',
        demon:     'Demon',
        draenei:   'Draenei',
        dragon:    'Dragon',
        dwarf:     'Dwarf',
        egg:       'Egg',
        elemental: 'Elemental',
        furbolg:   'Furbolg',
        gnome:     'Gnome',
        goblin:    'Goblin',
        goblin2:   'Goblin2',
        halforc:   'Halforc',
        human:     'Human',
        mech:      'Mech',
        murloc:    'Murloc',
        naga:      'Naga',
        nerubian:  'Nerubian',
        nightelf:  'Nightelf',
        ogre:      'Ogre',
        old_god:   'Old God',
        orc:       'Orc',
        pirate:    'Pirate',
        quilboar:  'Quilboar',
        scourge:   'Scourge',
        tauren:    'Tauren',
        totem:     'Totem',
        treant:    'Treant',
        troll:     'Troll',
        undead:    'Undead',
        worgen:    'Worgen',
    },

    mechanic: {
        adapt:                           'adapt',
        adjacent_battlecry:              'adjacent_battlecry',
        adjacent_buff:                   'adjacent_buff',
        advance_fight:                   'advance_fight', // only in adventure
        adventure:                       'adventure',
        affected_by_healing_does_damage: 'affected_by_healing_does_damage',
        affected_by_spell_power:         'affected_by_spell_power',
        ai_must_play:                    'ai_must_play',
        armor:                           'armor',
        aura:                            'aura',
        auto_attack:                     'auto_attack',
        avenge:                          'avenge',
        base_galakrond:                  'base_galakrond',
        battlecry:                       'battlecry',
        battlegrounds_action:            'battlegrounds_action',
        battlegrounds_bob_skin:          'battlegrounds_bob_skin',
        battlegrounds_hero_skin:         'battlegrounds_hero_skin',
        battlegrounds_hero:              'battlegrounds_hero',
        battlegrounds_kel_thuzad:        'battlegrounds_kel_thuzad',
        battlegrounds_minion_summoned:   'battlegrounds_minion_summoned',
        bleed:                           'bleed',
        blood_gem:                       'blood_gem',
        buff_attack_up:                  'buff_attack_up',
        buff_cost_down:                  'buff_cost_down',
        buff_cost_up:                    'buff_cost_up',
        buff_cost_zero:                  'buff_cost_zero',
        buff_durability_up:              'buff_durability_up',
        buff_health_up:                  'buff_health_up',
        cant_attack_hero:                'cant_attack_hero',
        cant_attack:                     'cant_attack',
        cant_be_destroyed:               'cant_be_destroyed',
        cant_be_fatigued:                'cant_be_fatigued',
        cant_be_silenced:                'cant_be_silenced',
        cant_be_targeted_by_hero_powers: 'cant_be_targeted_by_hero_powers',
        cant_be_targeted_by_spells:      'cant_be_targeted_by_spells',
        cariel_hero_power_advanced:      'cariel_hero_power_advanced',
        casts_when_drawn:                'casts_when_drawn',
        cat:                             'cat',
        charge:                          'charge',
        choose_one:                      'choose_one',
        city_of_stormwind_1:             'city_of_stormwind_1', // only on City of Stormwind
        city_of_stormwind_2:             'city_of_stormwind_2', // only on City of Stormwind
        coin_skin:                       'coin_skin',
        colossal:                        'colossal',
        combo:                           'combo',
        conditional_awake:               'conditional_awake',
        consider_spell_power:            'consider_spell_power', // effects considering spell power that is not a damage
        copy_spell_on_itself:            'copy_spell_on_itself',
        corrupt:                         'corrupt',
        corrupted:                       'corrupted',
        counter:                         'counter',
        critical_damage:                 'critical_damage',
        current_spellpower_nature:       'current_spellpower_nature',
        darkmoon_prize:                  'darkmoon_prize',
        deathblow:                       'deathblow',
        deathrattle:                     'deathrattle',
        discard_cards:                   'discard_cards',
        discover:                        'discover',
        divine_shield:                   'divine_shield',
        dormant_visual:                  'dormant_visual',
        dormant:                         'dormant',
        double_spell_damage:             'double_spell_damage',
        drag_minion:                     'drag_minion', // drag_minion_to_buy & drag_minion_to_sell
        dungeon_passive_buff:            'dungeon_passive_buff',
        echo:                            'echo',
        elusive:                         'elusive',
        enchantment_invisible:           'enchantment_invisible',
        enraged:                         'enraged',
        evil_glow:                       'evil_glow',
        excavate_treasure:               'excavate treasure',
        excavate:                        'excavate',
        fantastic_treasure:              'fantastic_treasure',
        fatigue:                         'fatigue',
        filter_even_in_collection:       'filter_even_in_collection',
        filter_odd_in_collection:        'filter_odd_in_collection',
        finish_attack_spell_on_damage:   'finish_attack_spell_on_damage',
        forgetful:                       'forgetful',
        freeze:                          'freeze',
        frenzy:                          'frenzy',
        frozen:                          'frozen',
        function_watcher:                'function_watcher',
        functionally_dead:               'functionally_dead',
        galakrond_hero:                  'galakrond_hero',
        game_button:                     'game_button',
        gears:                           'gears', // maybe related to Dr. Boom
        generate_soul_fragment:          'generate_soul_fragment',
        ghostly:                         'ghostly', // destroy if it is in your hand at end of turn
        has_diamond:                     'has_diamond',
        health:                          'health',
        hero_power_damage:               'hero_power_damage',
        hide_attack:                     'hide_attack', // only on Unleash the Beast
        hide_cost:                       'hide_cost',
        hide_health:                     'hide_health',
        hide_stats:                      'hide_stats',
        hide_watermark:                  'hide_watermark',
        ignore_hide_stats_for_big_card:  'ignore_hide_stats_for_big_card',
        immune_to_spell_power:           'immune_to_spell_power',
        immune:                          'immune',
        imp:                             'imp',
        in_bobs_tavern:                  'in_bobs_tavern', // enchantments works in bob's tavern
        in_mini_set:                     'in_mini_set',
        inspire:                         'inspire',
        invisible_deathrattle:           'invisible_deathrattle',
        invoke:                          'invoke',
        is_coin:                         'is coin',
        is_companion:                    'Battlegrounds Companion',
        jade_golem:                      'jade_golem', // it should be a referenced tag
        kingsbane_1:                     'kingsbane_1', // only on kingsbane
        kingsbane_2:                     'kingsbane_2', // only on kingsbane
        kurtrus_hero_power_advanced:     'kurtrus_hero_power_advanced',
        lackey:                          'lackey',
        lettuce_attack:                  'lettuce_attack', // unknown
        lettuce_bounty_boss:             'lettuce_bounty_boss',
        lettuce_current_cooldown:        'lettuce_current_cooldown',
        lettuce_equipment:               'lettuce_equipment',
        lettuce_mercenary:               'lettuce_mercenary',
        lettuce_no_action:               'lettuce_no_action',
        lettuce_passive_ability:         'lettuce_passive_ability',
        lettuce_start_of_combat_bonus:   'lettuce_start_of_combat_bonus',
        lettuce_start_of_combat:         'lettuce_start_of_combat',
        libram:                          'libram',
        lifesteal:                       'lifesteal',
        mega_windfury:                   'mega_windfury',
        modular:                         'modular',
        morph:                           'morph',
        new_battlegrounds_hero:          'new_battlegrounds_hero',
        non_keyword_echo:                'non_keyword_echo',
        non_keyword_poisonous:           'non_keyword_poisonous',
        one_turn_effect:                 'one_turn_effect',
        opponent_turn_deathrattle:       'opponent_turn_deathrattle',
        outcast:                         'outcast',
        overkill:                        'overkill',
        overload_owed:                   'overload_owed',
        overload:                        'overload',
        permanent:                       'permanent', // permanent enchantments in battlegrounds
        piece_of_cthun:                  'piece_of_cthun',
        poison:                          'poison',
        poisonous:                       'poisonous',
        prefer_attack_can_kill:          'prefer attack can kill',
        premium:                         'premium',
        puzzle_type:                     'puzzle_type',
        puzzle:                          'puzzle',
        quickdraw:                       'quickdraw',
        random_deck:                     'random_deck',
        rastakhan_treasure:              'rastakhan_treasure',
        reborn:                          'reborn',
        recruit:                         'recruit',
        refresh:                         'refresh',
        ritual:                          'ritual',
        root:                            'root',
        rush:                            'rush',
        secret_deathrattle:              'secret_deathrattle',
        secret:                          'secret',
        shifting_spell:                  'shifting spell',
        shrine:                          'shrine',
        shudderwork:                     'shudderwork',
        si_7:                            'si_7',
        sigil:                           'sigil',
        silence:                         'silence',
        spare_part:                      'spare_part',
        special_deathrattle:             'special_deathrattle',
        special_deck:                    'special_deck',
        spell_power_arcane:              'spell_power_arcane',
        spell_power_fel:                 'spell_power_fel',
        spell_power_fire:                'spell_power_fire',
        spell_power_frost:               'spell_power_frost',
        spell_power_holy:                'spell_power_holy',
        spell_power_nature:              'spell_power_nature',
        spell_power_shadow:              'spell_power_shadow',
        spell_power:                     'spell_power', // processed individually
        spell_resistance_fire:           'spell_resistance_fire',
        spell_weakness_fire:             'spell_weakness_fire',
        spell_weakness_frost:            'spell_weakness_frost',
        spell_weakness_holy:             'spell_weakness_holy',
        spell_weakness_nature:           'Nature Weakness',
        spell_weakness_shadow:           'spell_weakness_shadow',
        spellburst:                      'spellburst',
        spellcraft:                      'Spellcraft',
        start_dormant:                   'start_dormant',
        start_of_combat_1:               'start_of_combat_1',
        start_of_combat_2:               'start_of_combat_2', // only on 8 battlegrounds hero power
        start_of_combat_3:               'start_of_combat_3',
        start_of_combat_affect_left:     'start_of_combat_affect_left', // only on 8 battlegrounds hero power
        start_of_combat_affect_right:    'start_of_combat_affect_right',
        start_of_game:                   'start_of_game',
        stealth:                         'stealth',
        studies:                         'studies',
        summoned:                        'summoned', // only on Mind Controlling
        suppress_all_summon_vo:          'suppress_all_summon_vo',
        taunt:                           'taunt',
        the_rat_king_skill:              'the_rat_king_skill',
        topdeck:                         'topdeck',
        tradable:                        'tradable',
        transfromed_card_visual_type:    'transfromed_card_visual_type', // only on Corrupt cards
        treat_as_played_hero_card:       'treat_as_played_hero_card',
        trigger_visual:                  'trigger_visual',
        twinspell:                       'twinspell',
        untouchable:                     'untouchable',
        use_discover_visuals:            'use_discover_visuals',
        windfury:                        'windfury', // processed individually, includes mega_windfury
    },
};
