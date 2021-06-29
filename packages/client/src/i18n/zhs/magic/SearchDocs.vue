<template>
    <q-page class="q-pa-md">
        <div class="brief">
            在下面的表格中，<code class="var regex">/regex/</code>指正则表达式，<code class="var string">string</code>指任何单引号字符串<code>'single'</code>、双引号字符串<code>"double"</code>或不含引号和空格的字符串<code>raw</code>。引号字符串中使用反斜杠作为转义字符。使用<code class="var param">param</code>指代上述两者之一。<code class="var number">number</code>为十进制数字。<br>
            如果表格中存在<code>key=param</code>一行，则<code>key!=param</code>搜索与之相反的牌；<code>:</code>和<code>!:</code>同理。如果表格中存在<code>key&gt;param</code>一行，则<code>&gt;</code>也可替换为<code>=</code>、<code>!=</code>、<code>&gt;=</code>、<code>&lt;</code>或<code>&lt;=</code>。
        </div>

        <table class="detail q-mt-md">
            <tr>
                <th :colspan="2">搜索条件</th>
                <th>匹配的牌</th>
                <th>例子</th>
            </tr>
            <tr>
                <td :colspan="2"><code><span class="var string">P</span>/<span class="var string">T</span></code></td>
                <td>等价于<code>power=<span class="var string">P</span> toughness=<span class="var string">T</span></code>。见下。</td>
                <td><example query="2/3">力量等于2且防御力等于3的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>[<span class="var string">L</span>]</code></td>
                <td>等价于<code>loyalty=<span class="var string">L</span></code>。见下。</td>
                <td><example query="[3]">忠诚度为3的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code class="var string">{*}{*}.....{*}</code></td>
                <td>法术力费用或文本中包含该符号的牌。</td>
                <td><example query="{W}{U}{B}{R}{G}"><magic-text>法术力费用或文本中包含{W}{U}{B}{R}{G}的牌</magic-text></example></td>
            </tr>
            <tr>
                <td :colspan="2"><code class="var param">param</code>，但并非上述情况</td>
                <td>等价于<code>name.oracle:<span class="var param">param</span></code>与<code>name.unified:<span class="var param">param</span></code>的加和。见下。</td>
                <td><example query="龙">名字中包含「龙」的牌</example></td>
            </tr>
            <tr>
                <td :rowspan="5"><code>name</code>，<code>n</code></td>
                <td :colspan="2">
                    如果<code>name</code>使用了后缀<code>.oracle</code>、<code>.unified</code>或<code>.printed</code>，<br>
                    或<code>n</code>使用了前缀<code>o</code>、<code>u</code>或<code>p</code>，<br>
                    则分别代表只匹配牌张的Oracle名称、统一名称（本地化的Oracle）或牌面印刷的名称。<br>
                    若无前缀或后缀，则代表同时对这三个名称进行匹配。
                </td>
            </tr>
            <tr>
                <td><code>=<span class="var string">string</span></code></td>
                <td>名称与<code class="var string">string</code>相同的牌。</td>
                <td><example query="on=&quot;Colossal Dreadmaw&quot;">Oracle名称为Colossal Dreadmaw的牌</example></td>
            </tr>
            <tr>
                <td><code>=<span class="var regex">/regex/</span></code></td>
                <td>等价于<code>name:/^<span class="var regex">regex</span>$/</code>.</td>
            </tr>
            <tr>
                <td><code>:<span class="var string">string</span></code></td>
                <td>名称包含<code class="var string">string</code>的牌。</td>
            </tr>
            <tr>
                <td><code>:<span class="var regex">/regex/</span></code></td>
                <td>名称匹配<code class="var regex">regex</code>的牌。正则表达式总是使用忽略大小写和多行模式（<code>$</code>能匹配到换行）。</td>
            </tr>
            <tr>
                <td :colspan="2"><code>type</code>，<code>t</code></td>
                <td>与<code>name</code>和<code>n</code>类似，但匹配的是类别。它可以匹配牌张类别、副类别或超类别，也可以直接匹配类别栏的内容。</td>
                <td><example query="t:legendary">传奇牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>text</code>，<code>x</code></td>
                <td>与<code>name</code>和<code>n</code>类似，但匹配的是文本。</td>
            </tr>
            <tr>
                <td :colspan="2"><code>o</code></td>
                <td>等价于<code>text.oracle</code>与<code>text.unified</code>的加和。</td>
                <td><example query="o:/历传/">文本中包含历传的牌</example></td>
            </tr>
            <tr>
                <td :rowspan="5"><code>color</code>，<code>c</code></td>
                <td :colspan="2">匹配颜色。参数忽略大小写。</td>
            </tr>
            <tr>
                <td><code>:c</code><br><code>=c</code><br><code>:colorless</code><br><code>=colorless</code></td>
                <td>无色牌。</td>
                <td><example query="c:c">无色牌</example></td>
            </tr>
            <tr>
                <td><code>:m</code><br><code>:multicolor</code></td>
                <td>多色牌。</td>
            </tr>
            <tr>
                <td><code>&gt;<span class="var number">number</span></code></td>
                <td>匹配颜色多于该数量的牌。</td>
                <td><example query="c>=4">有四种或更多颜色的牌</example>
                </td>
            </tr>
            <tr>
                <td>
                    <code>:<span class="var colors">colors</span></code><br>
                    <code>&gt;<span class="var colors">colors</span></code>
                </td>
                <td>
                    匹配特定颜色的牌。<code>:</code>的行为与<code>&gt;=</code>的行为相同。<br>
                    <code class="var colors">colors</code>可以是单个单词（见下）或是<code>WUBRGOP</code>的任意组合。
                </td>
                <td><example query="c=pink">粉色牌（衍生物）</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>color-identity</code>，<code>cd</code></td>
                <td>与<code>color</code>和<code>c</code>类似，但匹配的是标识色。</td>
                <td><example query="cd=jeskai">标识色为洁斯凯色的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>color-indicator</code>，<code>ci</code></td>
                <td>与<code>color</code>和<code>c</code>类似，但匹配的是颜色标记。</td>
                <td><example query="ci=R">颜色标记为红色的牌</example></td>
            </tr>
            <tr>
                <td :rowspan="4">
                    <code>cost</code>，<code>mana</code>，<br>
                    <code>mana-cost</code>，<code>m</code>
                </td>
                <td>
                    <code>:null</code><br>
                    <code>=null</code>
                </td>
                <td>没有法术力费用的牌。</td>
                <td><example query="m:null">没有法术力费用的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code class="var cost">cost</code>为任意法术力费用符号的组合，可以包含或不包含大括号。</td>
            </tr>
            <tr>
                <td><code>:<span class="var cost">cost</span></code></td>
                <td>
                    法术力费用包含<code class="var cost">cost</code>中每个符号的牌。<br>
                    与<code>&gt;=</code>不同。例如，法术力费用为<magic-text>{2}{B}</magic-text>的牌能被<code>m>=1B</code>匹配，但不能被<code>m:1B</code>匹配。
                </td>
                <td><example query="m:2/W"><magic-text>法术力费用包含{2/W}的牌</magic-text></example></td>
            </tr>
            <tr>
                <td><code>&gt;<span class="var cost">cost</span></code></td>
                <td>法术力费用大于<code class="var cost">cost</code>的牌。</td>
                <td><example query="m=0"><magic-text>法术力费用为{0}的牌</magic-text></example></td>
            </tr>
            <tr>
                <td><code>mana-value</code>，<code>mv</code>，<code>cmc</code></td>
                <td><code>&gt;<span class="var number">number</span></code></td>
                <td>法术力值大于<code class="var number">number</code>的牌。</td>
                <td><example query="mv>10">法术力值大于10的牌</example></td>
            </tr>
            <tr>
                <td :rowspan="3"><code>power</code>，<code>pow</code></td>
                <td><code>:*</code></td>
                <td>力量不是数字的牌。</td>
                <td><example query="pow:*">力量不是数字的牌</example></td>
            </tr>
            <tr>
                <td><code>&gt;<span class="var number">number</span></code></td>
                <td>力量大于该数字的牌。</td>
                <td><example query="pow<0">力量小于0的牌</example></td>
            </tr>
            <tr>
                <td><code>=<span class="var string">string</span></code></td>
                <td>
                    力量等于<code class="var string">string</code>的牌。
                    注意，该<code class="var string">string</code>不是数字。
                    如果它是数字，则适用上一条，进行数字比较。例如，+1与1会被认为相等。它忽略大小写。
                </td>
                <td><example query="pow:* pow!=*">力量不是数字，但也不是*的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>tougheness</code>，<code>tou</code></td>
                <td>与<code>power</code>类似，但匹配的是防御力。</td>
                <td><example query="tou=0.5">防御力为0.5的牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>loyalty</code></td>
                <td>与<code>power</code>类似，但匹配的是忠诚度。</td>
                <td><example query="loyalty=X">忠诚度为X的牌</example></td>
            </tr>
            <tr>
                <td>
                    <code>set</code>，<code>s</code><br>
                    <code>expansion</code>，<code>e</code>
                </td>
                <td>
                    <code>:<span class="var string">string</span></code><br>
                    <code>=<span class="var string">string</span></code>
                </td>
                <td>系列代号为<code class="var string">string</code>的牌。</td>
                <td><example query="s:fut">预知将来系列的牌</example></td>
            </tr>
            <tr>
                <td><code>number</code>，<code>num</code></td>
                <td>
                    <code>:<span class="var string">string</span></code><br>
                    <code>=<span class="var string">string</span></code>
                </td>
                <td>收藏编号为<code class="var string">string</code>的牌。</td>
                <td><example query="num:100">收藏编号为100的牌</example></td>
            </tr>
            <tr>
                <td><code>lang</code>，<code>l</code></td>
                <td>
                    <code>:<span class="var string">string</span></code><br>
                    <code>=<span class="var string">string</span></code>
                </td>
                <td>语言为<code class="var string">string</code>的牌。</td>
                <td><example query="l:ph">非瑞克西亚文牌</example></td>
            </tr>
            <tr>
                <td><code>layout</code></td>
                <td>
                    <code>:<span class="var string">string</span></code><br>
                    <code>=<span class="var string">string</span></code>
                </td>
                <td>牌张布局为<code class="var string">string</code>的牌。</td>
                <td><example query="layout:modal_dfc">模式双面牌</example></td>
            </tr>
            <tr>
                <td :colspan="2"><code>flavor-text</code>，<code>ft</code></td>
                <td>匹配风味文字。它与<code>text</code>的运作方式类似，但不支持前缀后缀。</td>
                <td><example query="ft:阿司魔拉诺马尔迪卡带斯提纳酷达卡">风味文字包含阿司魔拉诺马尔迪卡带斯提纳酷达卡的牌</example></td>
            </tr>
            <tr>
                <td><code>rarity</code>，<code>r</code></td>
                <td>
                    <code>:<span class="var rarity">rarity</span></code><br>
                    <code>=<span class="var rarity">rarity</span></code>
                </td>
                <td>稀有度为<code class="var rarity">rarity</code>的牌。可用的稀有度单词见下表。</td>
                <td><example query="r:m">秘稀牌</example></td>
            </tr>
        </table>

        <table class="q-mt-md">
            <caption>单色颜色单词列表</caption>
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

        <table class="q-mt-md">
            <caption>颜色组合列表</caption>
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

        <table class="q-mt-md">
            <caption>稀有度列表</caption>
            <tr>
                <td><code>common</code>（普通） = <code>c</code></td>
                <td><code>uncommon</code>（非普通） = <code>u</code></td>
                <td><code>rare</code>（稀有） = <code>r</code></td>
                <td><code>mythic</code>（秘稀） = <code>m</code></td>
                <td><code>special</code>（特殊） = <code>s</code></td>
            </tr>
        </table>
    </q-page>
</template>

<style lang="sass" scoped src="../../search-docs.sass"/>

<script lang="ts">
import { defineComponent } from 'vue';

import pageSetup from 'setup/page';

import Example from 'components/SearchExample.vue';
import MagicText from 'components/magic/Text.vue';

export default defineComponent({
    components: { Example, MagicText },

    setup() {
        pageSetup({
            title: '搜索文档',
        });
    },
});
</script>
