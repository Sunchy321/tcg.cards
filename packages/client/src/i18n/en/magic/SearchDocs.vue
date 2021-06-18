<template>
    <q-page>
        <div class="item">
            <div class="desc">
                <div class="title">General</div>
                <magic-text class="content">
                    Search for term looks like <code>key op arg</code> (no space). <br>
                    <code>key</code> indicates the property searched for. <br>
                    <code>op</code> is <code>:</code>, <code>!:</code>, <code>=</code>, <code>!=</code>, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, and <code>&gt;=</code>, in which last 6 operators are called comparison operator. <br>
                    <code>arg</code> is a regular expression <code>/regex/</code>, a quoted string <code>'single'</code> or <code>"double"</code>, or just a simple string that dosen't contain space. <br>
                    Both <code>key</code> and <code>op</code> can be omitted simultaneously. <br>
                </magic-text>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Default</div>
                <magic-text class="content">
                    <code>P/T</code> searches for cards with power <code>P</code> and toughness <code>T</code>. <br>
                    <code>[L]</code> searches for cards with loyalty <code>L</code>. <br>
                    <code>{*}...{*}</code> searches for cards with that cost in mana cost or text. <br>
                    Otherwise, <code>arg</code> is same as <code>name:arg</code>.
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="2/3">
                    <magic-text>
                        Cards with power 2 and toughness 3
                    </magic-text>
                </search-example>
                <search-example query="[3]">
                    <magic-text>
                        Cards with loyalty 3
                    </magic-text>
                </search-example>
                <search-example query="{W}{U}{B}{R}{G}">
                    <magic-text>
                        Cards with {W}{U}{B}{R}{G} in cost or text
                    </magic-text>
                </search-example>
                <search-example query="dragon">
                    <magic-text>
                        Cards with dragon in name
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Name, type, and text</div>
                <magic-text class="content">
                    <code>name</code> and <code>n</code> search for name. <code>type</code> and <code>t</code> search for type. <code>text</code> and <code>x</code> search for card text. None of them supports comparison operators. If a regular expression is used as argument, the multiline mode and ignore case mode is on.<br>
                    All of long forms can have suffix <code>.oracle</code>, <code>.unified</code>, or <code>.printed</code>, which is used to search for only Oracle, unified (localized Oracle text), or printed (what is printed on card) property. The short form is add prefix <code>o</code>, <code>u</code>, and <code>p</code>. For example, to search for cards with some printed text, <code>text.printed</code> or <code>px</code> can be used. <br>
                    <code>o</code> is the combination of <code>text.oracle</code> and <code>text.unified</code>.
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="on=&quot;colossal Dreadmaw&quot;">
                    <magic-text>
                        Cards with Oracle name Colossal Dreadmaw
                    </magic-text>
                </search-example>
                <search-example query="t:legendary">
                    <magic-text>
                        Legendary Cards
                    </magic-text>
                </search-example>
                <search-example query="o:/\bepic\b/">
                    <magic-text>
                        Cards with word Epic in its text box
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Colors</div>
                <magic-text class="content">
                    <code>color</code> and <code>c</code> search for color. <code>color-indicator</code> and <code>ci</code> search for color indicator. <code>color-identity</code> and <code>cd</code> search for color identity. None of them supports regex args. Arguments are case insensitive. <br>
                    <code>c:c</code> and <code>c:colorless</code> search for colorless cards. <code>c:m</code> and <code>c:multicolor</code> search for multicolored cards. None of them supports comparison operators. <br>
                    <code>c:&lt;number&gt;</code> searches for cards with certain count of colors. It supports comparison operators. <br>
                    <code>c:&lt;colors&gt;</code> searches for colors. <code>&lt;colors&gt;</code> can be any of <code>W</code>, <code>U</code>, <code>B</code>, <code>R</code>, <code>G</code>, <code>O</code>, <code>P</code>. <code>&lt;colors&gt;</code> can also be a single word (see below).
                    <table>
                        <tr>
                            <td><code>white</code> = <code>W</code></td>
                            <td><code>blue</code> = <code>U</code></td>
                            <td><code>black</code> = <code>B</code></td>
                            <td><code>red</code> = <code>R</code></td>
                            <td><code>green</code> = <code>G</code></td>
                            <td><code>gold</code> = <code>O</code></td>
                            <td><code>pink</code> = <code>P</code></td>
                        </tr>
                    </table>
                    <table>
                        <tr>
                            <td><code>azorius</code> = <code>WU</code></td>
                            <td><code>dimir</code> = <code>UB</code></td>
                            <td><code>rakdos</code> = <code>BR</code></td>
                            <td><code>gruul</code> = <code>RG</code></td>
                            <td><code>selesyna</code> = <code>GW</code></td>
                        </tr>
                        <tr>
                            <td><code>orzhov</code> = <code>WB</code></td>
                            <td><code>izzet</code> = <code>UR</code></td>
                            <td><code>golgari</code> = <code>BG</code></td>
                            <td><code>boros</code> = <code>RW</code></td>
                            <td><code>simic</code> = <code>GU</code></td>
                        </tr>
                        <tr>
                            <td><code>bant</code> = <code>GWU</code></td>
                            <td><code>esper</code> = <code>WUB</code></td>
                            <td><code>grixis</code> = <code>UBR</code></td>
                            <td><code>jund</code> = <code>BRG</code></td>
                            <td><code>naya</code> = <code>RGW</code></td>
                        </tr>
                        <tr>
                            <td><code>mardu</code> = <code>RWB</code></td>
                            <td><code>temur</code> = <code>GUR</code></td>
                            <td><code>abzan</code> = <code>WBG</code></td>
                            <td><code>jeskai</code> = <code>URW</code></td>
                            <td><code>sultai</code> = <code>BGU</code></td>
                        </tr>
                        <tr>
                            <td><code>chaos</code> = <code>UBRG</code></td>
                            <td><code>aggression</code> = <code>WBRG</code></td>
                            <td><code>altruism</code> = <code>WURG</code></td>
                            <td><code>growth</code> = <code>WUBG</code></td>
                            <td><code>artifice</code> = <code>WUBR</code></td>
                        </tr>
                    </table>
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="c:c">
                    <magic-text>
                        Colorless cards
                    </magic-text>
                </search-example>
                <search-example query="cd=jeskai">
                    <magic-text>
                        Cards with jeskai identity
                    </magic-text>
                </search-example>
                <search-example query="ci=R">
                    <magic-text>
                        Cards with red color indicator
                    </magic-text>
                </search-example>
                <search-example query="c>=4">
                    <magic-text>
                        Cards with 4 or more color
                    </magic-text>
                </search-example>
                <search-example query="c=pink">
                    <magic-text>
                        Pink cards (tokens)
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Mana cost and mana value</div>
                <magic-text class="content">
                    <code>cost</code>, <code>mana</code>, <code>mana-cost</code>, and <code>m</code> search for mana cost. None of them supports regex args. <br>
                    <code>m:&lt;cost&gt;</code> searches for cards with cost that includes all symbols in <code>&lt;cost&gt;</code>. <code>m</code> also supports comparison operators. Notice that <code>m&gt;=&lt;cost&gt;</code> searches for cards with cost that is larger than or equal to <code>&lt;cost&gt;</code>. For example, card with mana cost {2}{B} can be searched by <code>m&gt;=1B</code> but not by <code>m:1B</code>. <code>&lt;cost&gt;</code> can contain any braced symbol <code>{*}</code> or any braceless symbol such as <code>S</code> or <code>2/W</code>. <br>
                    <code>m:null</code> searches for cards without mana cost. <code>m=null</code> is same as <code>m:null</code>. Except for the opposite of that operators, other comparison operators are not supported. <br>
                    <code>mana-value</code>, <code>mv</code>, and <code>cmc</code> search for mana value. All of them don't support regex args but supports all operators.
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="m=0">
                    <magic-text>
                        Cards with mana cost {0}
                    </magic-text>
                </search-example>
                <search-example query="m:null">
                    <magic-text>
                        Cards without mana cost
                    </magic-text>
                </search-example>
                <search-example query="m:2/W">
                    <magic-text>
                        Cards whose cost including {2/W}
                    </magic-text>
                </search-example>
                <search-example query="mv>10">
                    <magic-text>
                        Cards whose mana value is large than 10
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Simple properties</div>
                <magic-text class="content">
                    <code>set</code>, <code>expansion</code>, <code>s</code>, and <code>e</code> search for set. <code>number</code> and <code>n</code> search for number. <code>lang</code> and <code>l</code> search for language. <code>layout</code> searches for layout. <br>
                    All of above don't support regex args and only support operators <code>:</code> and <code>!:</code>. <br>
                    <code>flavor-text</code> and <code>ft</code> search for flavor text. It works like <code>text</code>.
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="s:fut">
                    <magic-text>
                        Cards in Future Sight
                    </magic-text>
                </search-example>
                <search-example query="n:100">
                    <magic-text>
                        Cards with collector number 100
                    </magic-text>
                </search-example>
                <search-example query="l:ph">
                    <magic-text>
                        Cards written in phrexian language
                    </magic-text>
                </search-example>
                <search-example query="layout:modal_dfc">
                    <magic-text>
                        Modal double-faced cards
                    </magic-text>
                </search-example>
                <search-example query="ft:asmoranomardicadaistinaculdacar">
                    <magic-text>
                        Cards whose flavor text contains Asmoranomardicadaistinaculdacar
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="desc">
                <div class="title">Rarity</div>
                <magic-text class="content">
                    <code>rarity</code> and <code>r</code> search for rarity. The shorthands of rarities are listed below. Notice that the mythic rare rarity use keyword <code>mythic</code>, not <code>mythic rare</code>.
                    <table>
                        <tr>
                            <td><code>common</code> = <code>c</code></td>
                            <td><code>uncommon</code> = <code>u</code></td>
                            <td><code>rare</code> = <code>r</code></td>
                            <td><code>mythic</code> = <code>m</code></td>
                        </tr>
                    </table>
                </magic-text>
            </div>
            <div class="examples">
                <search-example query="r:m">
                    <magic-text>
                        Mythic rare cards
                    </magic-text>
                </search-example>
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped src="../../search-docs.sass"/>

<script lang="ts">
import { defineComponent } from 'vue';

import pageSetup from 'setup/page';

import SearchExample from 'components/SearchExample.vue';
import MagicText from 'components/magic/Text.vue';

export default defineComponent({
    components: { SearchExample, MagicText },

    setup() {
        pageSetup({
            title: 'Search Docs',
        });
    },
});
</script>
