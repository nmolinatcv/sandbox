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

function wrapHtml(html) {
  const trimmed = html.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) return html;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>';
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

function clearAll() {
  lastPasteData = null;
  document.getElementById('pastPlain').textContent = '(paste to see)';
  document.getElementById('pastHtml').textContent = '(paste to see)';
  document.getElementById('htmlRendered').srcdoc = '';
  document.getElementById('output').textContent = '(paste to see)';
  document.getElementById('downloadJson').disabled = true;
  document.getElementById('copyJson').disabled = true;
  document.getElementById('pasteTarget').value = '';
  document.getElementById('pasteTarget').focus();
}

document.getElementById('downloadJson').addEventListener('click', downloadJson);
document.getElementById('copyJson').addEventListener('click', copyJson);
document.getElementById('clear').addEventListener('click', clearAll);
document.getElementById('pasteTarget').focus();

document.getElementById('pasteTarget').addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData?.getData('text/html') || '';
  const text = e.clipboardData?.getData('text/plain') || '';
  const isMsOffice = html.includes('urn:schemas-microsoft-com:office');

  document.getElementById('pastPlain').textContent = text || '(empty)';
  document.getElementById('pastHtml').textContent = html || '(empty)';

  const iframe = document.getElementById('htmlRendered');
  iframe.srcdoc = html ? wrapHtml(html) : '<p style="color:#999">(empty)</p>';

  const types = [...(e.clipboardData?.types || [])].join(', ') || '(none)';
  const lines = text.split('\n');
  const out = ['Clipboard types: ' + types];
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

  document.getElementById('output').textContent = out.join('\n');

  lastPasteData = {
    timestamp: new Date().toISOString(),
    clipboardTypes: types,
    plainText: text,
    plainTextLength: text.length,
    html: html,
    htmlLength: html.length,
    isMsOffice,
    analysis: out.join('\n'),
  };
  document.getElementById('downloadJson').disabled = false;
  document.getElementById('copyJson').disabled = false;
});
