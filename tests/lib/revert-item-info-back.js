// Undo the "Item Info → ← Regresar" feature edits (Preview 9af8830 → feature/item-info-back-button),
// so older scope guards can keep comparing everything else byte-for-byte. No-op on 9af8830.
'use strict';
module.exports = function revertItemInfoBack(src) {
  return src
    .replace(/\n\/\/ Regresar a Item Type \/ Gender desde Item Info\.[^\n]*\n[\s\S]*?\nfunction clBackToType\(\) \{\n[\s\S]*?\n\}\n/, () => '')
    .replace(`data-cl-type="\${t.id}" onclick="clChangeType('\${t.id}');`, () => `onclick="clSetType('\${t.id}');`)
    .replace(`data-cl-gender="\${g.id}" onclick="clChangeGender('\${g.id}');`, () => `onclick="cl.gender='\${g.id}';`)
    .replace('\n    <button class="ag-btn" id="cl-attr-back-top" onclick="clBackToType()" style="margin-bottom:12px">← Regresar</button>', () => '')
    .replace('<button class="ag-btn" onclick="clBackToType()" style="flex:1">← Back</button>', () => '<button class="ag-btn" onclick="clGo(1)" style="flex:1">← Back</button>');
};
