const bulletChars = { '•': 0, '·': 0, 'o': 1, '§': 2, '▪': 3 };
const specialChars = {
  '\u200B': 'ZERO WIDTH SPACE',
  '\u200C': 'ZERO WIDTH NON-JOINER',
  '\u200D': 'ZERO WIDTH JOINER',
  '\uFEFF': 'BOM / ZERO WIDTH NO-BREAK',
  '\u202A': 'LTR EMBED',
  '\u202B': 'RTL EMBED',
  '\u202C': 'POP DIRECTIONAL',
};

let lastPasteData = null;

function getHtmlTree(html) {
  if (!html?.trim()) return '(empty)';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines = [];
    const maxDepth = 20;

    function traverse(el, prefix, isLast, depth) {
      if (depth > 20 || el.nodeType !== 1) return;
      const tag = el.tagName.toLowerCase();
      const connector = isLast ? '└─ ' : '├─ ';
      lines.push(prefix + connector + tag);
      const childPrefix = prefix + (isLast ? '   ' : '│  ');
      const children = el.children;
      for (let i = 0; i < children.length && lines.length < 500; i++) {
        traverse(children[i], childPrefix, i === children.length - 1, depth + 1);
      }
    }

    const body = doc.body;
    if (!body?.children?.length) return '(empty)';
    const roots = body.children;
    for (let i = 0; i < roots.length && lines.length < 500; i++) {
      traverse(roots[i], '', i === roots.length - 1, 0);
    }
    return lines.join('\n') || '(empty)';
  } catch {
    return '(parse error)';
  }
}

function wrapHtml(html) {
  const trimmed = html.trim();
  const constrainStyle = '<style>body{max-width:100%;overflow-x:auto;box-sizing:border-box}*{box-sizing:inherit}</style>';
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return trimmed.includes('</head>') ? html.replace('</head>', constrainStyle + '</head>') : constrainStyle + html;
  }
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' + constrainStyle + '</head><body>' + html + '</body></html>';
}

function getExportData() {
  if (!lastPasteData) return null;
  return {
    ...lastPasteData,
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
    },
  };
}

function downloadJson() {
  const data = getExportData();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'paste-debug-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyJson() {
  const data = getExportData();
  if (!data) return;
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
}

function populateFromData(data) {
  const text = data.plainText ?? '';
  const html = data.html ?? '';
  const analysis = data.analysis ?? '';

  document.getElementById('pastPlain').textContent = text || '(empty)';
  document.getElementById('pastHtml').textContent = html || '(empty)';
  document.getElementById('pastHtmlTree').textContent = getHtmlTree(html);
  document.getElementById('output').textContent = analysis || '(empty)';

  const iframe = document.getElementById('htmlRendered');
  iframe.srcdoc = html ? wrapHtml(html) : '<p style="color:#999">(empty)</p>';
  iframe.classList.toggle('empty', !html);

  lastPasteData = { ...data, plainText: text, html, analysis };
  document.getElementById('downloadJson').disabled = false;
  document.getElementById('copyJson').disabled = false;
}

function importJson() {
  const input = document.getElementById('importFile');
  input.value = '';
  input.click();
}

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.plainText && !data.html && !data.analysis) {
        throw new Error('Invalid format: missing plainText, html, or analysis');
      }
      populateFromData(data);
    } catch (err) {
      alert('Invalid JSON or format: ' + (err.message || 'parse error'));
    }
  };
  reader.readAsText(file);
});

function clearAll() {
  lastPasteData = null;
  document.getElementById('pastPlain').textContent = '(paste to see)';
  document.getElementById('pastHtml').textContent = '(paste to see)';
  document.getElementById('pastHtmlTree').textContent = '(paste to see)';
  const iframe = document.getElementById('htmlRendered');
  iframe.srcdoc = '';
  iframe.classList.add('empty');
  document.getElementById('output').textContent = '(paste to see)';
  document.getElementById('downloadJson').disabled = true;
  document.getElementById('copyJson').disabled = true;
  document.getElementById('pasteTarget').value = '';
  document.getElementById('pasteTarget').focus();
}

document.getElementById('downloadJson').addEventListener('click', downloadJson);
document.getElementById('copyJson').addEventListener('click', copyJson);
document.getElementById('importJson').addEventListener('click', importJson);
document.getElementById('clear').addEventListener('click', clearAll);
document.getElementById('pasteTarget').focus();

function buildAnalysis(text, html, clipboardTypes) {
  const isMsOffice = html.includes('urn:schemas-microsoft-com:office');
  const lines = text.split('\n');
  const out = ['Clipboard types: ' + clipboardTypes];
  out.push('Plain text length: ' + text.length);
  out.push('HTML length: ' + html.length);
  out.push('MS Office detected: ' + isMsOffice);
  out.push('');

  let foundSpecial = false;
  [...text].forEach((c, i) => {
    if (c in specialChars) {
      if (!foundSpecial) { out.push('Special/invisible chars:'); foundSpecial = true; }
      out.push('  pos ' + i + ': ' + specialChars[c] + ' U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    }
  });
  if (foundSpecial) out.push('');

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const fc = trimmed[0];
    const cp = fc?.codePointAt?.(0);
    const hex = cp != null ? 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') : '?';
    const matched = fc in bulletChars || (fc === 'o' && /^o\s/.test(trimmed));
    const prefix = matched ? '  ' : '!!';
    out.push(prefix + ' line ' + i + ': firstChar="' + fc + '" ' + hex + ' matched=' + matched);
  });

  return out.join('\n');
}

document.getElementById('pasteTarget').addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData?.getData('text/html') || '';
  const text = e.clipboardData?.getData('text/plain') || '';
  const clipboardTypes = [...(e.clipboardData?.types || [])].join(', ') || '(none)';

  populateFromData({
    timestamp: new Date().toISOString(),
    clipboardTypes,
    plainText: text,
    plainTextLength: text.length,
    html,
    htmlLength: html.length,
    isMsOffice: html.includes('urn:schemas-microsoft-com:office'),
    analysis: buildAnalysis(text, html, clipboardTypes),
  });
});
