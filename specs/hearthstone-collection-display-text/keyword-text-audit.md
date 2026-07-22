# KEYWORD_TEXT `m_name` 历史变更审计

## 范围

- 拆包版本：`246003`。
- 仅审计 `KEYWORD_TEXT.json` 中的非空 `m_name` 字段；不包含 `m_text`、`m_refText`、`m_collectionText`。
- 翻译源：`data/hearthstone/hsdata/Strings/<locale>/GLOBAL.txt`。
- 历史范围：各语言 `GLOBAL.txt` 的全部 Git 修订。行尾 CR 在比较前被规范化，因此 CRLF/LF 变化不会被记录为文本替换。
- 共 195 个去重名称 key：188 个当前在全部 14 种语言存在；7 个废弃 key 当前在所有语言缺失：`GLOBAL_KEYWORD_CONTRABAND`、`GLOBAL_KEYWORD_ETHEREAL`、`GLOBAL_KEYWORD_HALL_OF_FAME`、`GLOBAL_KEYWORD_LOCKED`、`GLOBAL_KEYWORD_PROPHECY`、`GLOBAL_KEYWORD_STUDY`、`GLOBAL_KEYWORD_WAND`。

## 统计

| 语言 | 当前可解析名称 key | 发生过名称替换的 key | 替换次数 |
| --- | ---: | ---: | ---: |
| deDE | 188 | 18 | 19 |
| enUS | 188 | 2 | 3 |
| esES | 188 | 15 | 17 |
| esMX | 188 | 24 | 26 |
| frFR | 188 | 19 | 20 |
| itIT | 188 | 16 | 17 |
| jaJP | 188 | 0 | 0 |
| koKR | 188 | 16 | 22 |
| plPL | 188 | 17 | 19 |
| ptBR | 188 | 20 | 23 |
| ruRU | 188 | 17 | 22 |
| thTH | 188 | 2 | 2 |
| zhCN | 188 | 18 | 20 |
| zhTW | 188 | 23 | 24 |

## 变更清单

下文只列出至少一种语言发生过替换的 `m_name` key。每个 `旧值 -> 新值` 是一次实际替换，括号内为 hsdata 提交短哈希；未列出的 `m_name` 从其首次进入可追溯历史以来未发生文本替换。

- <code>GLOBAL_KEYWORD_BACON_BONUS_KEYWORDS</code>：记录 ID/tag 334/3423。
  - ruRU：<code>Дополнительные свойства</code> -> <code>Бонусные свойства</code> (937f3499)。
- <code>GLOBAL_KEYWORD_BACON_BOUNTY</code>：记录 ID/tag 379/4231。
  - zhTW：<code>懸賞</code> -> <code>賞金</code> (2a7cd4f8)。
- <code>GLOBAL_KEYWORD_BACON_ELEMENTAL_BONUS</code>：记录 ID/tag 358/4197。
  - itIT：<code>Bonus elementale</code> -> <code>Bonus Elementale</code> (b5c75290)；ptBR：<code>Bônus elemental</code> -> <code>Bônus Elemental</code> (b5c75290)。
- <code>GLOBAL_KEYWORD_BACON_TIMEWARP</code>：记录 ID/tag 391/4517。
  - deDE：<code>Zeitverzerrung</code> -> <code>Zeitkrümmung</code> (1ae046d7)。
- <code>GLOBAL_KEYWORD_BATTLECRY</code>：记录 ID/tag 8/218。
  - deDE：<code>Battlecry</code> -> <code>Kampfschrei</code> (9223719c)；esES：<code>Battlecry</code> -> <code>Grito de batalla</code> (9223719c)；esMX：<code>Battlecry</code> -> <code>Grito de batalla</code> (9223719c)；frFR：<code>Battlecry</code> -> <code>Cri de guerre</code> (9223719c)；itIT：<code>Battlecry</code> -> <code>Grido di Battaglia</code> (9223719c)；koKR：<code>Battlecry</code> -> <code>전투의 함성</code> (9223719c)；plPL：<code>Battlecry</code> -> <code>Okrzyk bojowy</code> (9223719c)；ptBR：<code>Battlecry</code> -> <code>Grito de Guerra</code> (9223719c)；ruRU：<code>Battlecry</code> -> <code>Боевой клич</code> (9223719c)；zhCN：<code>Battlecry</code> -> <code>战吼</code> (9223719c)；zhTW：<code>Battlecry</code> -> <code>戰吼</code> (9223719c)。
- <code>GLOBAL_KEYWORD_BENCH_MERC</code>：记录 ID/tag 248/2570。
  - deDE：<code>BANK</code> -> <code>Bank</code> (bdbccfdb)；esES：<code>BANQUILLO</code> -> <code>Banquillo</code> (bdbccfdb)；esMX：<code>BANCA</code> -> <code>Banca</code> (bdbccfdb)；frFR：<code>RÉSERVE</code> -> <code>Réserve</code> (bdbccfdb)；itIT：<code>PANCHINA</code> -> <code>Panchina</code> (bdbccfdb)；plPL：<code>REZERWA</code> -> <code>Rezerwa</code> (bdbccfdb)；ptBR：<code>BANCO</code> -> <code>Banco</code> (bdbccfdb)；ruRU：<code>СКАМЬЯ</code> -> <code>Скамья</code> (bdbccfdb)。
- <code>GLOBAL_KEYWORD_BONUSEFFECTS</code>：记录 ID/tag 262/2934。
  - esMX：<code>Efectos de bonificación</code> -> <code>Efectos adicionales</code> (f69196f9)；ptBR：<code>Efeitos bônus</code> -> <code>Efeitos Bônus</code> (eb55ef6b)。
- <code>GLOBAL_KEYWORD_CHARGE</code>：记录 ID/tag 4/197。
  - deDE：<code>Charge</code> -> <code>Ansturm</code> (9223719c)；esES：<code>Charge</code> -> <code>Cargar</code> (9223719c)；esMX：<code>Charge</code> -> <code>Carga</code> (9223719c)；itIT：<code>Charge</code> -> <code>Carica</code> (9223719c)；koKR：<code>Charge</code> -> <code>돌진</code> (9223719c)；plPL：<code>Charge</code> -> <code>Szarża</code> (9223719c)；ptBR：<code>Charge</code> -> <code>Investida</code> (9223719c)；ruRU：<code>Charge</code> -> <code>Рывок</code> (9223719c)；zhCN：<code>Charge</code> -> <code>冲锋</code> (9223719c)；zhTW：<code>Charge</code> -> <code>衝鋒</code> (9223719c)。
- <code>GLOBAL_KEYWORD_COMBO</code>：记录 ID/tag 13/220。
  - koKR：<code>Combo</code> -> <code>연계</code> (9223719c)；plPL：<code>Combo</code> -> <code>Kombinacja</code> (9223719c)；ruRU：<code>Combo</code> -> <code>Серия приемов</code> (9223719c)；zhCN：<code>Combo</code> -> <code>连击</code> (9223719c)；zhTW：<code>Combo</code> -> <code>連擊</code> (9223719c)。
- <code>GLOBAL_KEYWORD_CORPSE</code>：记录 ID/tag 247/2559。
  - zhCN：<code>尸体</code> -> <code>残骸</code> (fa1e1992)。
- <code>GLOBAL_KEYWORD_COUNTER</code>：记录 ID/tag 16/340。
  - deDE：<code>Counter</code> -> <code>Konter</code> (9223719c)；esES：<code>Counter</code> -> <code>Contrarrestar</code> (9223719c)；esMX：<code>Counter</code> -> <code>Contrarrestar</code> (9223719c)；itIT：<code>Counter</code> -> <code>Contrasto</code> (9223719c)；koKR：<code>Counter</code> -> <code>차단</code> (9223719c)；plPL：<code>Counter</code> -> <code>Kontra</code> (9223719c)；ptBR：<code>Counter</code> -> <code>Anular</code> (9223719c)；ruRU：<code>Counter</code> -> <code>Отмена</code> (9223719c)；zhCN：<code>Counter</code> -> <code>反制</code> (9223719c)；zhTW：<code>Counter</code> -> <code>反制</code> (9223719c)。
- <code>GLOBAL_KEYWORD_CRITICAL_DAMAGE</code>：记录 ID/tag 224/2219。
  - zhCN：<code>爆击伤害</code> -> <code>暴击伤害</code> (0c209c9a)。
- <code>GLOBAL_KEYWORD_CTHUN</code>：记录 ID/tag 22/436。
  - deDE：<code>C'Thun, Alter Gott</code> -> <code>C’Thun, Alter Gott</code> (dc7133a2)。
- <code>GLOBAL_KEYWORD_DEATHRATTLE</code>：记录 ID/tag 12/217。
  - deDE：<code>Deathrattle</code> -> <code>Todesröcheln</code> (9223719c)；esES：<code>Deathrattle</code> -> <code>Último aliento</code> (9223719c)；esMX：<code>Deathrattle</code> -> <code>Estertor</code> (9223719c)；frFR：<code>Deathrattle</code> -> <code>Râle d’agonie</code> (9223719c)；itIT：<code>Deathrattle</code> -> <code>Rantolo di Morte</code> (9223719c)；koKR：<code>Deathrattle</code> -> <code>죽음의 신음</code> (9223719c)；koKR：<code>죽음의 신음</code> -> <code>죽음의 메아리</code> (c31c9e6f)；plPL：<code>Deathrattle</code> -> <code>Agonia</code> (9223719c)；ptBR：<code>Deathrattle</code> -> <code>Estertor de Morte</code> (9223719c)；ptBR：<code>Estertor de Morte</code> -> <code>Último Suspiro</code> (c31c9e6f)；ruRU：<code>Deathrattle</code> -> <code>Предсмертный хрип</code> (9223719c)；zhCN：<code>Deathrattle</code> -> <code>亡语</code> (9223719c)；zhTW：<code>Deathrattle</code> -> <code>死亡之聲</code> (9223719c)。
- <code>GLOBAL_KEYWORD_DEMON_HUNTER_TOURIST</code>：记录 ID/tag 311/3601。
  - thTH：<code>นักท่องเที่ยวของดีมอนฮันเตอร์</code> -> <code>นักท่องเที่ยว[b]ของดีมอนฮันเตอร์</code> (fa1e1992)。
- <code>GLOBAL_KEYWORD_DIVINE_SHIELD</code>：记录 ID/tag 3/194。
  - deDE：<code>Divine Shield</code> -> <code>Gottesschild</code> (9223719c)；esES：<code>Divine Shield</code> -> <code>Escudo divino</code> (9223719c)；esMX：<code>Divine Shield</code> -> <code>Escudo divino</code> (9223719c)；frFR：<code>Divine Shield</code> -> <code>Bouclier divin</code> (9223719c)；itIT：<code>Divine Shield</code> -> <code>Scudo Divino</code> (9223719c)；koKR：<code>Divine Shield</code> -> <code>천상의 보호막</code> (9223719c)；plPL：<code>Divine Shield</code> -> <code>Boska tarcza</code> (9223719c)；ptBR：<code>Divine Shield</code> -> <code>Escudo Divino</code> (9223719c)；ruRU：<code>Divine Shield</code> -> <code>Божественный щит</code> (9223719c)；zhCN：<code>Divine Shield</code> -> <code>圣盾</code> (9223719c)；zhTW：<code>Divine Shield</code> -> <code>聖盾術</code> (9223719c)。
- <code>GLOBAL_KEYWORD_FLOOPY</code>：记录 ID/tag 74/1097。
  - thTH：<code>ฟลอบบิดินัส ฟลู๊ป</code> -> <code>ฟลอบบิดินัส ฟลู้ป</code> (ac324ef2)。
- <code>GLOBAL_KEYWORD_FREEZE</code>：记录 ID/tag 10/208。
  - deDE：<code>Freeze</code> -> <code>Einfrieren</code> (9223719c)；esES：<code>Freeze</code> -> <code>Congelación</code> (9223719c)；esMX：<code>Freeze</code> -> <code>Congelar</code> (9223719c)；frFR：<code>Freeze</code> -> <code>Gel</code> (9223719c)；itIT：<code>Freeze</code> -> <code>Congelamento</code> (9223719c)；koKR：<code>Freeze</code> -> <code>얼어붙음</code> (9223719c)；koKR：<code>얼어붙음</code> -> <code>빙결</code> (344757d0)；plPL：<code>Freeze</code> -> <code>Zamrożenie</code> (9223719c)；ptBR：<code>Freeze</code> -> <code>Congelar</code> (9223719c)；ruRU：<code>Freeze</code> -> <code>Заморозка</code> (9223719c)；zhCN：<code>Freeze</code> -> <code>冻结</code> (9223719c)；zhTW：<code>Freeze</code> -> <code>凍結</code> (9223719c)。
- <code>GLOBAL_KEYWORD_FROZEN</code>：记录 ID/tag 9/260。
  - deDE：<code>Frozen</code> -> <code>Eingefroren</code> (9223719c)；esES：<code>Frozen</code> -> <code>Congelado</code> (9223719c)；esMX：<code>Frozen</code> -> <code>Congelado</code> (9223719c)；frFR：<code>Frozen</code> -> <code>Gelé</code> (9223719c)；itIT：<code>Frozen</code> -> <code>Congelato</code> (9223719c)；koKR：<code>Frozen</code> -> <code>얼어붙음</code> (9223719c)；koKR：<code>얼어붙음</code> -> <code>빙결</code> (344757d0)；plPL：<code>Frozen</code> -> <code>Zamrożenie</code> (9223719c)；ptBR：<code>Frozen</code> -> <code>Congelado</code> (9223719c)；ruRU：<code>Frozen</code> -> <code>Под действием заморозки</code> (9223719c)；zhCN：<code>Frozen</code> -> <code>被冻结</code> (9223719c)；zhTW：<code>Frozen</code> -> <code>凍結</code> (9223719c)。
- <code>GLOBAL_KEYWORD_IMBUE</code>：记录 ID/tag 318/3626。
  - zhTW：<code>灌注</code> -> <code>注能</code> (3949e706)。
- <code>GLOBAL_KEYWORD_IMMUNE</code>：记录 ID/tag 17/240。
  - deDE：<code>Immune</code> -> <code>Immun</code> (9223719c)；esES：<code>Immune</code> -> <code>Inmune</code> (9223719c)；esMX：<code>Immune</code> -> <code>Inmune</code> (9223719c)；frFR：<code>Immune</code> -> <code>Insensible</code> (9223719c)；koKR：<code>Immune</code> -> <code>피해 면역</code> (9223719c)；koKR：<code>피해 면역</code> -> <code>면역</code> (e3b02346)；plPL：<code>Immune</code> -> <code>Niewrażliwość</code> (9223719c)；ptBR：<code>Immune</code> -> <code>Imune</code> (9223719c)；ruRU：<code>Immune</code> -> <code>Неуязвимость</code> (9223719c)；zhCN：<code>Immune</code> -> <code>免疫</code> (9223719c)；zhTW：<code>Immune</code> -> <code>免疫</code> (9223719c)。
- <code>GLOBAL_KEYWORD_LIFESTEAL</code>：记录 ID/tag 38/685。
  - zhTW：<code>生命竊取 </code> -> <code>生命竊取</code> (e8bb5c0c)。
- <code>GLOBAL_KEYWORD_MEGAWINDFURY</code>：记录 ID/tag 77/1207。
  - plPL：<code>Mega furia wichru</code> -> <code>Megafuria wichru</code> (e8bb5c0c)。
- <code>GLOBAL_KEYWORD_MINION_TYPE_REFERENCE</code>：记录 ID/tag 24/447。
  - zhTW：<code>手下類別</code> -> <code>手下類型</code> (fef29090)。
- <code>GLOBAL_KEYWORD_QUICKDRAW</code>：记录 ID/tag 297/2905。
  - ptBR：<code>Compra Rápida</code> -> <code>Saque Rápido</code> (7cf19a32)。
- <code>GLOBAL_KEYWORD_REFRESH_MERC</code>：记录 ID/tag 229/2312。
  - ptBR：<code>Atualizar</code> -> <code>Restaurar</code> (bc1c29a1)。
- <code>GLOBAL_KEYWORD_SECRET</code>：记录 ID/tag 5/219。
  - deDE：<code>Secret</code> -> <code>Geheimnis</code> (9223719c)；esES：<code>Secret</code> -> <code>Secreto</code> (9223719c)；esMX：<code>Secret</code> -> <code>Secreto</code> (9223719c)；itIT：<code>Secret</code> -> <code>Segreto</code> (9223719c)；koKR：<code>Secret</code> -> <code>비밀</code> (9223719c)；plPL：<code>Secret</code> -> <code>Sekret</code> (9223719c)；ptBR：<code>Secret</code> -> <code>Segredo</code> (9223719c)；ruRU：<code>Secret</code> -> <code>Секрет</code> (9223719c)；zhCN：<code>Secret</code> -> <code>奥秘</code> (9223719c)；zhTW：<code>Secret</code> -> <code>秘密</code> (9223719c)。
- <code>GLOBAL_KEYWORD_SHATTER</code>：记录 ID/tag 371/4239。
  - koKR：<code>산산조각</code> -> <code>분쇄</code> (1bcf802f)；koKR：<code>분쇄</code> -> <code>산산조각</code> (a770d899)；zhTW：<code>粉碎</code> -> <code>碎裂</code> (a770d899)。
- <code>GLOBAL_KEYWORD_SILENCE</code>：记录 ID/tag 15/339。
  - deDE：<code>Silence</code> -> <code>Zum Schweigen bringen</code> (9223719c)；esES：<code>Silence</code> -> <code>Silencio</code> (9223719c)；esMX：<code>Silence</code> -> <code>Silenciar</code> (9223719c)；itIT：<code>Silence</code> -> <code>Silenzio</code> (9223719c)；koKR：<code>Silence</code> -> <code>침묵</code> (9223719c)；plPL：<code>Silence</code> -> <code>Wyciszenie</code> (9223719c)；ptBR：<code>Silence</code> -> <code>Silêncio</code> (9223719c)；ruRU：<code>Silence</code> -> <code>Безмолвие</code> (9223719c)；ruRU：<code>Безмолвие</code> -> <code>Немота</code> (c31c9e6f)；zhCN：<code>Silence</code> -> <code>沉默</code> (9223719c)；zhTW：<code>Silence</code> -> <code>沉默</code> (9223719c)。
- <code>GLOBAL_KEYWORD_SILENCE_MERC</code>：记录 ID/tag 250/2631。
  - zhTW：<code>沉默</code> -> <code>沉默無語</code> (54141c4a)。
- <code>GLOBAL_KEYWORD_SPAREPART</code>：记录 ID/tag 19/388。
  - deDE：<code>Ersatzteile</code> -> <code>Ersatzteil</code> (60ceb7f7)。
- <code>GLOBAL_KEYWORD_SPELLPOWER</code>：记录 ID/tag 2/192。
  - deDE：<code>Spell Power</code> -> <code>Zaubermacht</code> (9223719c)；deDE：<code>Zaubermacht</code> -> <code>Zauberschaden</code> (c31c9e6f)；enUS：<code>Spell Power</code> -> <code>Spell Damage</code> (c31c9e6f)；esES：<code>Spell Power</code> -> <code>Poder con hechizos</code> (9223719c)；esES：<code>Poder con hechizos</code> -> <code>Daño con hechizos</code> (c31c9e6f)；esMX：<code>Spell Power</code> -> <code>Poder de hechizo</code> (9223719c)；esMX：<code>Poder de hechizo</code> -> <code>Daño de hechizo</code> (c31c9e6f)；frFR：<code>Spell Power</code> -> <code>Puissance des sorts</code> (9223719c)；frFR：<code>Puissance des sorts</code> -> <code>Dégâts des sorts</code> (c31c9e6f)；itIT：<code>Spell Power</code> -> <code>Potenza Magica</code> (9223719c)；itIT：<code>Potenza Magica</code> -> <code>Danni Magici</code> (1b8d3741)；koKR：<code>Spell Power</code> -> <code>주문력</code> (9223719c)；koKR：<code>주문력</code> -> <code>주문 공격력</code> (c31c9e6f)；plPL：<code>Spell Power</code> -> <code>Moc zaklęć</code> (9223719c)；plPL：<code>Moc zaklęć</code> -> <code>Siła zaklęć</code> (c31c9e6f)；plPL：<code>Siła zaklęć</code> -> <code>Obrażenia zaklęć</code> (1b8d3741)；ptBR：<code>Spell Power</code> -> <code>Poder Mágico</code> (9223719c)；ptBR：<code>Poder Mágico</code> -> <code>Dano Mágico</code> (c31c9e6f)；ruRU：<code>Spell Power</code> -> <code>Сила заклинаний</code> (9223719c)；ruRU：<code>Сила заклинаний</code> -> <code>Урон от заклинаний</code> (c31c9e6f)；zhCN：<code>Spell Power</code> -> <code>法术强度</code> (9223719c)；zhCN：<code>法术强度</code> -> <code>法术伤害</code> (c31c9e6f)；zhTW：<code>Spell Power</code> -> <code>法術能量</code> (9223719c)；zhTW：<code>法術能量</code> -> <code>法術傷害</code> (c31c9e6f)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_ARCANE</code>：记录 ID/tag 101/1945。
  - frFR：<code>Dégâts des sorts des Arcanes</code> -> <code>Dégâts des sorts des arcanes</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_FEL</code>：记录 ID/tag 107/1951。
  - frFR：<code>Dégâts des sorts de Fiel</code> -> <code>Dégâts des sorts de fiel</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_FIRE</code>：记录 ID/tag 102/1946。
  - frFR：<code>Dégâts des sorts de Feu</code> -> <code>Dégâts des sorts de feu</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_FROST</code>：记录 ID/tag 103/1947。
  - enUS：<code>Frost Spell Damage</code> -> <code>Frost Spell Damage </code> (e8bb5c0c)；enUS：<code>Frost Spell Damage </code> -> <code>Frost Spell Damage</code> (68ba2349)；esMX：<code>Daño de hechizo de Escarcha</code> -> <code>Daño de hechizo de Escarcha </code> (e8bb5c0c)；esMX：<code>Daño de hechizo de Escarcha </code> -> <code>Daño de hechizo de Escarcha</code> (68ba2349)；frFR：<code>Dégâts des sorts de Givre</code> -> <code>Dégâts des sorts de givre</code> (68ba2349)；itIT：<code>Danni Magici da Gelo</code> -> <code>Danni Magici da Gelo </code> (e8bb5c0c)；ptBR：<code>Dano Mágico de Gelo</code> -> <code>Dano Mágico de Gelo </code> (e8bb5c0c)；ptBR：<code>Dano Mágico de Gelo </code> -> <code>Dano Mágico de Gelo</code> (68ba2349)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_HOLY</code>：记录 ID/tag 105/1949。
  - frFR：<code>Dégâts des sorts du Sacré</code> -> <code>Dégâts des sorts du sacré</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_NATURE</code>：记录 ID/tag 104/1948。
  - frFR：<code>Dégâts des sorts de Nature</code> -> <code>Dégâts des sorts de nature</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLPOWER_SHADOW</code>：记录 ID/tag 106/1950。
  - frFR：<code>Dégâts des sorts d’Ombre</code> -> <code>Dégâts des sorts d’ombre</code> (fda7e0b9)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_ARCANE</code>：记录 ID/tag 199/2138。
  - esMX：<code>Resistencia a lo arcano</code> -> <code>Resistencia a lo Arcano</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_FEL</code>：记录 ID/tag 205/2144。
  - esMX：<code>Resistencia a lo vil</code> -> <code>Resistencia a lo Vil</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_FIRE</code>：记录 ID/tag 200/2139。
  - esMX：<code>Resistencia al fuego</code> -> <code>Resistencia al Fuego</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_FROST</code>：记录 ID/tag 201/2140。
  - esMX：<code>Resistencia a la escarcha</code> -> <code>Resistencia a la Escarcha</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_HOLY</code>：记录 ID/tag 203/2142。
  - esMX：<code>Resistencia a lo sagrado</code> -> <code>Resistencia a lo Sagrado</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_NATURE</code>：记录 ID/tag 202/2141。
  - esMX：<code>Resistencia a la naturaleza</code> -> <code>Resistencia a la Naturaleza</code> (533b0d85)。
- <code>GLOBAL_KEYWORD_SPELLRESISTANCE_SHADOW</code>：记录 ID/tag 204/2143。
  - esMX：<code>Resistencia a las sombras</code> -> <code>Resistencia a las Sombras</code> (533b0d85)；frFR：<code>Résistance : Ombre</code> -> <code>Résistance à l’Ombre</code> (d95f1fcf)。
- <code>GLOBAL_KEYWORD_SPELLWEAKNESS_FIRE</code>：记录 ID/tag 207/2146。
  - zhTW：<code>火焰弱點</code> -> <code>火焰虛弱</code> (254bb46a)。
- <code>GLOBAL_KEYWORD_SPELLWEAKNESS_FROST</code>：记录 ID/tag 208/2147。
  - zhTW：<code>冰霜弱點</code> -> <code>冰霜虛弱</code> (254bb46a)。
- <code>GLOBAL_KEYWORD_STEALTH</code>：记录 ID/tag 6/191。
  - deDE：<code>Stealth</code> -> <code>Verstohlenheit</code> (9223719c)；esES：<code>Stealth</code> -> <code>Sigilo</code> (9223719c)；esMX：<code>Stealth</code> -> <code>Sigilo</code> (9223719c)；frFR：<code>Stealth</code> -> <code>Camouflage</code> (9223719c)；itIT：<code>Stealth</code> -> <code>Furtività</code> (9223719c)；koKR：<code>Stealth</code> -> <code>은신</code> (9223719c)；plPL：<code>Stealth</code> -> <code>Ukrycie</code> (9223719c)；ptBR：<code>Stealth</code> -> <code>Furtividade</code> (9223719c)；ruRU：<code>Stealth</code> -> <code>Маскировка</code> (9223719c)；zhCN：<code>Stealth</code> -> <code>潜行</code> (9223719c)；zhTW：<code>Stealth</code> -> <code>潛行</code> (9223719c)。
- <code>GLOBAL_KEYWORD_TAUNT</code>：记录 ID/tag 1/190。
  - deDE：<code>Taunt</code> -> <code>Spott</code> (9223719c)；esES：<code>Taunt</code> -> <code>Provocar</code> (9223719c)；esMX：<code>Taunt</code> -> <code>Provocación</code> (9223719c)；frFR：<code>Taunt</code> -> <code>Provocation</code> (9223719c)；itIT：<code>Taunt</code> -> <code>Provocazione</code> (9223719c)；koKR：<code>Taunt</code> -> <code>도발</code> (9223719c)；plPL：<code>Taunt</code> -> <code>Prowokacja</code> (9223719c)；ptBR：<code>Taunt</code> -> <code>Provocar</code> (9223719c)；ruRU：<code>Taunt</code> -> <code>Провокация</code> (9223719c)；zhCN：<code>Taunt</code> -> <code>嘲讽</code> (9223719c)；zhTW：<code>Taunt</code> -> <code>嘲諷</code> (9223719c)。
- <code>GLOBAL_KEYWORD_VENOMOUS</code>：记录 ID/tag 261/2853。
  - zhCN：<code>烈毒</code> -> <code>心毒的</code> (b804d871)；zhCN：<code>心毒的</code> -> <code>烈毒</code> (68ba2349)。
- <code>GLOBAL_KEYWORD_WINDFURY</code>：记录 ID/tag 11/189。
  - deDE：<code>Windfury</code> -> <code>Windzorn</code> (9223719c)；esES：<code>Windfury</code> -> <code>Viento Furioso</code> (9223719c)；esES：<code>Viento Furioso</code> -> <code>Viento furioso</code> (e3b02346)；esMX：<code>Windfury</code> -> <code>Viento furioso</code> (9223719c)；frFR：<code>Windfury</code> -> <code>Furie des vents</code> (9223719c)；itIT：<code>Windfury</code> -> <code>Furia del Vento</code> (9223719c)；koKR：<code>Windfury</code> -> <code>질풍</code> (9223719c)；plPL：<code>Windfury</code> -> <code>Furia wichru</code> (9223719c)；ptBR：<code>Windfury</code> -> <code>Fúria dos Ventos</code> (9223719c)；ruRU：<code>Windfury</code> -> <code>Неистовство ветра </code> (9223719c)；ruRU：<code>Неистовство ветра </code> -> <code>Неистовство ветра</code> (c31c9e6f)；ruRU：<code>Неистовство ветра</code> -> <code>Неистовство ветра </code> (ff82e0ab)；ruRU：<code>Неистовство ветра </code> -> <code>Неистовство ветра</code> (af481578)；zhCN：<code>Windfury</code> -> <code>风怒</code> (9223719c)；zhTW：<code>Windfury</code> -> <code>風怒</code> (9223719c)。
<!-- audit-data-end -->

## `CATA_206` / `CATA_206t` 存在期间的变更

范围从领域表取得，而非导入侧原始表：查询 `hearthstone.active_entities` 与 `hearthstone.active_entity_localizations` 后，得到以下卡牌及版本数组。

| cardId | 名称 | dbfId | 领域表中的 build |
| --- | --- | ---: | --- |
| `CATA_206` | Twisted Monstrosity | 123119 | 237510、238003、238087、239422、239550、240397、240818、241135、241170、241958、242566、243002、244584、245096、245258、246003 |
| `CATA_206t` | Twisted Monstrosity | 131326 | 239550、240397、240818、241135、241170、241958、242566、243002、244584、245096、245258、246003 |

以这些 build 的数字 tag 读取 hsdata 提交。两个 cardId 的并集时间范围为 `237510` 至 `246003`；下表是所比较的 16 个 tag 快照。

| build/tag | hsdata commit |
| ---: | --- |
| 237510 | `a770d899b7ea12594f2edfc7d097f6ee0a858eb8` |
| 238003 | `b33fc0dc2bfac846a02a1272a7e90712cc09f2ae` |
| 238087 | `5e6e25dc87f430ff9604ffbceef0f3b9b7ac23ab` |
| 239422 | `552bca16aca965b882c1614b4673afa0f93d3f6e` |
| 239550 | `8616eadbbd159acd6009e50bce099b806d1467e1` |
| 240397 | `62b1db99f9ce03d0ef608164b007462566232196` |
| 240818 | `0c48b3cbe897e7cff6ef5f5722d0421c3711430e` |
| 241135 | `6ffe8675fdc725ebee1d90f469363812848f2240` |
| 241170 | `4e0a10f68ee3329bfda2e61bf7ab8bc5a191c0c3` |
| 241958 | `3b4b051a478011645936cde5ec47230768658033` |
| 242566 | `50e1a32a3285ed9f4b905420b532fd58d9c7392a` |
| 243002 | `f20ef234ef004ee4fa455ccebfd2781515203385` |
| 244584 | `38f2bde2391a663603a0f97b8e0c70e0a7c2fd2c` |
| 245096 | `0d639c98fc7a6f3e9a32ea35ebb512015f45e01d` |
| 245258 | `da2c40bb20e72fbbe5f7fae17bdf884d3cded930` |
| 246003 | `59c1e1229b3e48ecbc4436fda2fb0a22030d3808` |

在这 16 个 tag 快照中，188 个可解析 `m_name` 只有 3 个 key、共 3 次替换；均为日语，发生于 `245096` 到 `245258`。其余 13 种语言没有任何 `m_name` 替换。该替换也落在两张卡共同存在的范围内，因此分别以 `CATA_206` 或 `CATA_206t` 作为范围计算时结论相同。

| key | 语言 | build 变化 | 旧值 | 新值 |
| --- | --- | --- | --- | --- |
| `GLOBAL_KEYWORD_PREPARE` | jaJP | `245096 -> 245258` | `準備` | `仕込み` |
| `GLOBAL_KEYWORD_PREPARED` | jaJP | `245096 -> 245258` | `準備万端` | `仕込み完了` |
| `GLOBAL_KEYWORD_PREPARING` | jaJP | `245096 -> 245258` | `準備中` | `仕込み中` |

`CATA_206` 实际引用的动态关键词是 `GLOBAL_KEYWORD_ELUSIVE`（tag 1211）和 `GLOBAL_KEYWORD_TAUNT`（tag 190）；它们在全部 16 个相关 tag 快照、全部 14 种语言中均未变化。
