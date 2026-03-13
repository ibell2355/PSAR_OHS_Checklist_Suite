function toScalar(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineArray(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((item) => toScalar(item.trim()));
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, container: root }];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) { i += 1; continue; }

    const indent = line.match(/^\s*/)[0].length;

    const isArrayItem = trimmed.startsWith('- ');
    while (stack.length > 1 && (isArrayItem ? indent < stack[stack.length - 1].indent : indent <= stack[stack.length - 1].indent)) stack.pop();
    const parent = stack[stack.length - 1].container;

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`Invalid array placement for line: ${line}`);
      parent.push(toScalar(trimmed.slice(2)));
      i += 1;
      continue;
    }

    const idx = trimmed.indexOf(':');
    if (idx < 0) { i += 1; continue; }

    let key = trimmed.slice(0, idx).trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.slice(1, -1);
    }
    const rest = trimmed.slice(idx + 1).trim();

    if (rest === '>' || rest === '|') {
      i += 1;
      const blockIndent = indent;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed) { i += 1; continue; }
        const nextIndent = nextLine.match(/^\s*/)[0].length;
        if (nextIndent <= blockIndent) break;
        i += 1;
      }
      parent[key] = '';
      continue;
    }

    if (rest) {
      const arr = parseInlineArray(rest);
      if (arr !== null) {
        parent[key] = arr;
      } else {
        parent[key] = toScalar(rest);
      }
      i += 1;
      continue;
    }

    const nextLine = lines[i + 1] || '';
    const isArray = nextLine.trim().startsWith('- ');
    parent[key] = isArray ? [] : {};
    stack.push({ indent, container: parent[key] });
    i += 1;
  }

  return root;
}
