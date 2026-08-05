import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

import ts from 'typescript';

const roots = ['apps/client/src', 'packages/ui/src'];
const interactiveElements = new Set(['InteractivePressable', 'Pressable']);
const failures = [];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (extname(path) === '.tsx') files.push(path);
  }
  return files;
}

for (const root of roots) {
  for (const file of await collect(root)) {
    const text = await readFile(file, 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(source);
        if (interactiveElements.has(name)) {
          const hasHandler = node.attributes.properties.some(
            (property) =>
              ts.isJsxSpreadAttribute(property) ||
              (ts.isJsxAttribute(property) && property.name.getText(source) === 'onPress'),
          );
          if (!hasHandler) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            failures.push(`${relative('.', file)}:${line + 1} <${name}> 缺少 onPress`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

if (failures.length > 0) {
  console.error('发现无交互处理器的可点击元素：');
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Interaction guard passed: every Pressable has an onPress path.');
}
