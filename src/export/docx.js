// Tiny DOCX generator: headings, paragraphs (with bold runs), bullet lists and simple tables.
import { zip } from './zip.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runs(text) {
  // **bold** support
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = /^\*\*.*\*\*$/.test(part);
    const t = bold ? part.slice(2, -2) : part;
    return `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join('');
}

const para = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs(text)}</w:p>`;

function table(rows) {
  const cell = (t, head) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${head ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : runs(t)}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:color="9BB6C9"/>`).join('')}</w:tblBorders></w:tblPr>${rows.map((r, i) => `<w:tr>${r.map((c) => cell(c, i === 0)).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
}

/**
 * blocks: [{ h1|h2|h3: text } | { p: text } | { ul: [text] } | { table: [[...]] } | { pageBreak: true }]
 */
export function buildDocx(blocks, { title = 'Report', author = 'MAR-ESP SIM UC' } = {}) {
  const body = blocks.map((b) => {
    if (b.h1) return para(b.h1, 'Heading1');
    if (b.h2) return para(b.h2, 'Heading2');
    if (b.h3) return para(b.h3, 'Heading3');
    if (b.p != null) return String(b.p).split('\n').map((line) => para(line)).join('');
    if (b.ul) return b.ul.map((li) => para('• ' + li, 'ListParagraph')).join('');
    if (b.table) return table(b.table);
    if (b.pageBreak) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    return '';
  }).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0B4F7C"/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1A7FB0"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: styles },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
  ];
  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// Convert a simple Markdown string into docx blocks (headings, bullets, tables, paragraphs).
export function markdownToBlocks(md) {
  const blocks = [];
  const lines = md.split('\n');
  let tableRows = null;
  for (const line of lines) {
    if (/^\|/.test(line)) {
      if (/^\|\s*-/.test(line)) continue;
      (tableRows ||= []).push(line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      continue;
    }
    if (tableRows) { blocks.push({ table: tableRows }); tableRows = null; }
    if (/^# /.test(line)) blocks.push({ h1: line.slice(2) });
    else if (/^## /.test(line)) blocks.push({ h2: line.slice(3) });
    else if (/^### /.test(line)) blocks.push({ h3: line.slice(4) });
    else if (/^[-*] /.test(line)) blocks.push({ ul: [line.slice(2)] });
    else if (/^> /.test(line)) blocks.push({ p: line.slice(2) });
    else if (line.trim()) blocks.push({ p: line });
  }
  if (tableRows) blocks.push({ table: tableRows });
  return blocks;
}
