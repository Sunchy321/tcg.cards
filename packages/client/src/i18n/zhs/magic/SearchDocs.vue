<template>
    <q-page>
        <div class="item">
            <div class="desc">
                <div class="title">概述</div>
                <magic-text class="content">
                    搜索文本形如<code>key op arg</code>（不含空格）。<br>
                    <code>key</code>指明了要搜索的属性。<br>
                    <code>op</code>包含<code>:</code>，<code>!:</code>，<code>=</code>，<code>!=</code>，<code>&lt;</code>，<code>&gt;</code>，<code>&lt;=</code>和<code>&gt;=</code>，其中后六个称为比较运算符。<br>
                    <code>arg</code>可以是正则表达式<code>/regex/</code>，引号字符串<code>'single'</code>或<code>"double"</code>，或者是简单的不包含空格的字符串。<br>
                    <code>key</code>和<code>op</code>可以同时省略。
                </magic-text>
            </div>
        </div>
        <div class="item row">
            <div class="col-6 desc">
                <div class="title">默认情况</div>
                <magic-text class="content">
                    <code>P/T</code>搜索力量等于<code>P</code>且防御力等于<code>T</code>的牌。<br>
                    <code>[L]</code>搜索忠诚度为<code>L</code>的牌。<br>
                    <code>{*}...{*}</code>搜索法术力费用或文本中包含该费用的牌。<br>
                    若不属于以上情况之一，则<code>arg</code>等价于<code>name:arg</code>。
                </magic-text>
            </div>
            <div class="col-6 self-start flex items-start">
                <search-example query="2/3">
                    <magic-text>
                        力量等于2且防御力等于3的牌
                    </magic-text>
                </search-example>
                <search-example query="[3]">
                    <magic-text>
                        忠诚度为3的牌
                    </magic-text>
                </search-example>
                <search-example query="{W}{U}{B}{R}{G}">
                    <magic-text>
                        法术力费用或文本中包含{W}{U}{B}{R}{G}的牌
                    </magic-text>
                </search-example>
                <search-example query="龙">
                    <magic-text>
                        名字中包含「龙」的牌
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="col-6 desc">
                <div class="title">名称，类别和文本</div>
                <magic-text class="content">
                    <code>name</code>和<code>n</code>搜索名称；<code>type</code>和<code>t</code>搜索类别；<code>text</code>和<code>x</code>搜索文本。它们都不支持比较运算符。如果你使用一个正则表达式作为参数，那么将总是忽略大小写并使用多行模式。<br>
                    上述几个关键字的较长形式都可以添加<code>.oracle</code>、<code>.unified</code>或<code>.printed</code>的后缀。它们分别对应搜索Oracle描述、统一描述（本地化版的Oracle文本）或牌面描述（实际印刷在牌上的描述）。较短的形式可以对应添加<code>o</code>、<code>u</code>或<code>p</code>的前缀。例如，如果你想搜索牌张的牌面文本，则你可以使用<code>text.printed</code>或<code>px</code>。<code>o</code>是<code>text.oracle</code>和<code>text.unified</code>的组合。
                </magic-text>
            </div>
            <div class="col-6 self-start flex items-start">
                <search-example query="on=&quot;colossal Dreadmaw&quot;">
                    <magic-text>
                        Oracle名称为Colossal Dreadmaw的牌
                    </magic-text>
                </search-example>
                <search-example query="t:legendary">
                    <magic-text>
                        传奇牌
                    </magic-text>
                </search-example>
                <search-example query="o:/历传/">
                    <magic-text>
                        文本中包含历传的牌
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="col-8 desc">
                <div class="title">颜色</div>
                <magic-text class="content">
                    <code>color</code>和<code>c</code>搜索颜色；<code>color-indicator</code>和<code>ci</code>搜索颜色标记；<code>color-identity</code>和<code>cd</code>搜索标识色。它们均不支持正则表达式。参数对大小写不敏感。<br>
                    <code>c:c</code>和<code>c:colorless</code>搜索无色牌。<code>c:m</code>和<code>c:multicolor</code>搜索多色牌。它们不支持比较运算符。<br>
                    <code>c:&lt;number&gt;</code>搜索具有特定颜色数量的牌。它支持比较运算符。
                    <code>c:&lt;colors&gt;</code>搜索具有特定颜色的牌。<code>&lt;colors&gt;</code>可以由<code>W</code>、<code>U</code>、<code>B</code>、<code>R</code>、<code>G</code>、<code>O</code>、<code>P</code>中的一个或多个组成。它也可以是单个单词（见下）。
                    <table>
                        <tr>
                            <td><code>white</code>（白） = <code>W</code></td>
                            <td><code>blue</code>（蓝） = <code>U</code></td>
                            <td><code>black</code>（黑） = <code>B</code></td>
                            <td><code>red</code>（红） = <code>R</code></td>
                            <td><code>green</code>（绿） = <code>G</code></td>
                            <td><code>gold</code>（金） = <code>O</code></td>
                            <td><code>pink</code>（粉） = <code>P</code></td>
                        </tr>
                    </table>
                    <table>
                        <tr>
                            <td><code>azorius</code>（俄佐立） = <code>WU</code></td>
                            <td><code>dimir</code>（底密尔） = <code>UB</code></td>
                            <td><code>rakdos</code>（拉铎司） = <code>BR</code></td>
                            <td><code>gruul</code>（古鲁） = <code>RG</code></td>
                            <td><code>selesyna</code>（瑟雷尼亚） = <code>GW</code></td>
                        </tr>
                        <tr>
                            <td><code>orzhov</code>（欧佐夫） = <code>WB</code></td>
                            <td><code>izzet</code>（伊捷） = <code>UR</code></td>
                            <td><code>golgari</code>（葛加理） = <code>BG</code></td>
                            <td><code>boros</code>（波洛斯） = <code>RW</code></td>
                            <td><code>simic</code>（析米克） = <code>GU</code></td>
                        </tr>
                        <tr>
                            <td><code>bant</code>（班特） = <code>GWU</code></td>
                            <td><code>esper</code>（艾斯波） = <code>WUB</code></td>
                            <td><code>grixis</code>（格利极） = <code>UBR</code></td>
                            <td><code>jund</code>（勇得） = <code>BRG</code></td>
                            <td><code>naya</code>（纳雅） = <code>RGW</code></td>
                        </tr>
                        <tr>
                            <td><code>mardu</code>（玛尔都） = <code>RWB</code></td>
                            <td><code>temur</code>（铁木尔） = <code>GUR</code></td>
                            <td><code>abzan</code>（阿布赞） = <code>WBG</code></td>
                            <td><code>jeskai</code>（洁斯凯） = <code>URW</code></td>
                            <td><code>sultai</code>（苏勒台） = <code>BGU</code></td>
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
            <div class="col-4 self-start flex items-start">
                <search-example query="c:c">
                    <magic-text>
                        无色牌
                    </magic-text>
                </search-example>
                <search-example query="cd=jeskai">
                    <magic-text>
                        标识色为洁斯凯色的牌
                    </magic-text>
                </search-example>
                <search-example query="ci=R">
                    <magic-text>
                        颜色标记为红色的牌
                    </magic-text>
                </search-example>
                <search-example query="c>=4">
                    <magic-text>
                        有四种或更多颜色的牌
                    </magic-text>
                </search-example>
                <search-example query="c=pink">
                    <magic-text>
                        粉色牌（衍生物）
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="col-6 desc">
                <div class="title">法术力费用和法术力值</div>
                <magic-text class="content">
                    <code>cost</code>，<code>mana</code>，<code>mana-cost</code>和<code>m</code>搜索法术力费用。它们不支持正则表达式。<br>
                    <code>m:&lt;cost&gt;</code>搜索那些法术力费用包含<code>&lt;cost&gt;</code>中每个符号的牌。它也支持比较运算符。注意<code>m&gt;=&lt;cost&gt;</code>搜索那些法术力费用大于或等于<code>&lt;cost&gt;</code>的牌。例如，法术力费用为{2}{B}的牌可以被<code>m&gt;=1B</code>搜到，但是不能被<code>m:1B</code>搜到。<code>&lt;cost&gt;</code>可以包含任何带大括号的符号，也可以包含不带大括号的符号，例如<code>S</code>或<code>2/W</code>。<br>
                    <code>m:null</code>搜索没有法术力费用的牌。<code>m=null</code>与它等价。除了这些运算符以及它们的反义运算符之外，其它的运算符不被支持。<br>
                    <code>mana-value</code>，<code>mv</code>和<code>cmc</code>搜索法术力值。它们不支持正则参数，但是支持任何运算符。
                </magic-text>
            </div>
            <div class="col-6 self-start flex items-start">
                <search-example query="m=0">
                    <magic-text>
                        法术力费用为{0}的牌
                    </magic-text>
                </search-example>
                <search-example query="m:null">
                    <magic-text>
                        没有法术力费用的牌
                    </magic-text>
                </search-example>
                <search-example query="m:2/W">
                    <magic-text>
                        法术力费用包含{2/W}的牌
                    </magic-text>
                </search-example>
                <search-example query="mv>10">
                    <magic-text>
                        法术力值大于10的牌
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="col-6 desc">
                <div class="title">简单属性</div>
                <magic-text class="content">
                    <code>set</code>、<code>expansion</code>、<code>s</code>和<code>e</code>搜索系列。<code>number</code>和<code>n</code>搜索收藏编号。<code>lang</code>和<code>l</code>搜索语言。<code>layout</code>搜索牌面布局。<br>
                    上述所有关键字不支持正则表达式且仅仅支持<code>:</code>和<code>!:</code>运算符。<br>
                    <code>flavor-text</code>和<code>ft</code>搜索风味文字。它与<code>text</code>的运作方式类似。
                </magic-text>
            </div>
            <div class="col-6 self-start flex items-start">
                <search-example query="s:fut">
                    <magic-text>
                        预知将来系列的牌
                    </magic-text>
                </search-example>
                <search-example query="n:100">
                    <magic-text>
                        收藏编号为100的牌
                    </magic-text>
                </search-example>
                <search-example query="l:ph">
                    <magic-text>
                        非瑞克西亚文牌
                    </magic-text>
                </search-example>
                <search-example query="layout:modal_dfc">
                    <magic-text>
                        模式双面牌
                    </magic-text>
                </search-example>
                <search-example query="ft:阿司魔拉诺马尔迪卡带斯提纳酷达卡">
                    <magic-text>
                        风味文字包含阿司魔拉诺马尔迪卡带斯提纳酷达卡的牌
                    </magic-text>
                </search-example>
            </div>
        </div>
        <div class="item row">
            <div class="col-6 desc">
                <div class="title">稀有度</div>
                <magic-text class="content">
                    <code>rarity</code>和<code>r</code>搜索稀有度。稀有度的缩写见下表。注意秘稀稀有度并不使用关键字<code>mythic rare</code>而是使用<code>mythic</code>。
                    <table>
                        <tr>
                            <td><code>common</code>（普通） = <code>c</code></td>
                            <td><code>uncommon</code>（非普通） = <code>u</code></td>
                            <td><code>rare</code>（稀有） = <code>r</code></td>
                            <td><code>mythic</code>（秘稀） = <code>m</code></td>
                        </tr>
                    </table>
                </magic-text>
            </div>
            <div class="col-6 self-start flex items-start">
                <search-example query="r:m">
                    <magic-text>
                        秘稀牌
                    </magic-text>
                </search-example>
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.item
    margin: 8px
    padding: 20px

    border-top: 1px grey solid

.title
    font-size: 200%

    margin-bottom: 8px

.desc
    padding-right: 5px

code
    color: #555

table
    width: 100%

.example
    flex-basis: 48%

    margin: 2px
    padding: 10px

    border: 1px grey solid
    border-radius: 10px
</style>

<script lang="ts">
import { defineComponent } from 'vue';

import SearchExample from 'components/SearchExample.vue';
import MagicText from 'components/magic/Text.vue';

export default defineComponent({
    components: { SearchExample, MagicText },
});
</script>
