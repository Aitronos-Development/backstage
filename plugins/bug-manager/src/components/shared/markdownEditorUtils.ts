/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type InsertionType = 'wrap' | 'line-prefix' | 'code' | 'link';

export interface ToolbarAction {
  id: string;
  label: string;
  icon: string;
  type: InsertionType;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  shortcutKey?: string;
}

export const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { id: 'bold', label: 'Bold', icon: 'FormatBold', type: 'wrap', prefix: '**', suffix: '**', placeholder: 'bold text', shortcutKey: 'b' },
  { id: 'italic', label: 'Italic', icon: 'FormatItalic', type: 'wrap', prefix: '_', suffix: '_', placeholder: 'italic text', shortcutKey: 'i' },
  { id: 'underline', label: 'Underline', icon: 'FormatUnderlined', type: 'wrap', prefix: '<u>', suffix: '</u>', placeholder: 'underlined text', shortcutKey: 'u' },
  { id: 'h1', label: 'Heading 1', icon: 'LooksOne', type: 'line-prefix', prefix: '# ', placeholder: 'Heading 1' },
  { id: 'h2', label: 'Heading 2', icon: 'LooksTwo', type: 'line-prefix', prefix: '## ', placeholder: 'Heading 2' },
  { id: 'bullet-list', label: 'Bullet List', icon: 'FormatListBulleted', type: 'line-prefix', prefix: '- ', placeholder: 'List item' },
  { id: 'numbered-list', label: 'Numbered List', icon: 'FormatListNumbered', type: 'line-prefix', prefix: '1. ', placeholder: 'List item' },
  { id: 'code', label: 'Code', icon: 'Code', type: 'code', placeholder: 'code' },
  { id: 'link', label: 'Link', icon: 'Link', type: 'link', placeholder: 'link text', shortcutKey: 'k' },
];

export const TOOLBAR_GROUPS: string[][] = [
  ['bold', 'italic', 'underline'],
  ['h1', 'h2'],
  ['bullet-list', 'numbered-list'],
  ['code', 'link'],
];

export interface InsertionResult {
  newValue: string;
  newSelectionStart: number;
  newSelectionEnd: number;
}

export function applyFormatting(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  action: ToolbarAction,
): InsertionResult {
  const selected = text.slice(selectionStart, selectionEnd);
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);

  switch (action.type) {
    case 'wrap': {
      const insert = selected || action.placeholder || '';
      const newText = `${before}${action.prefix}${insert}${action.suffix}${after}`;
      const cursorStart = selectionStart + action.prefix!.length;
      const cursorEnd = cursorStart + insert.length;
      return { newValue: newText, newSelectionStart: cursorStart, newSelectionEnd: cursorEnd };
    }

    case 'line-prefix': {
      const lineStart = before.lastIndexOf('\n') + 1;
      const linesToFormat = text.slice(lineStart, selectionEnd);
      const lines = linesToFormat.split('\n');

      const allHavePrefix = lines.every(line => line.startsWith(action.prefix!));

      let newLines: string[];
      if (allHavePrefix) {
        newLines = lines.map(line => line.slice(action.prefix!.length));
      } else {
        newLines = lines.map(line => `${action.prefix}${line}`);
      }

      const formatted = newLines.join('\n');
      const beforeLine = text.slice(0, lineStart);
      const afterSelection = text.slice(selectionEnd);
      const newText = `${beforeLine}${formatted}${afterSelection}`;

      const lengthDiff = formatted.length - linesToFormat.length;
      const prefixLen = action.prefix!.length;
      return {
        newValue: newText,
        newSelectionStart: Math.max(lineStart, selectionStart + (allHavePrefix ? -prefixLen : prefixLen)),
        newSelectionEnd: selectionEnd + lengthDiff,
      };
    }

    case 'code': {
      if (selected.includes('\n')) {
        const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
        const needsNewlineAfter = after.length > 0 && !after.startsWith('\n');
        const prefix = `${needsNewlineBefore ? '\n' : ''}\`\`\`\n`;
        const suffix = `\n\`\`\`${needsNewlineAfter ? '\n' : ''}`;
        const newText = `${before}${prefix}${selected}${suffix}${after}`;
        return {
          newValue: newText,
          newSelectionStart: before.length + prefix.length,
          newSelectionEnd: before.length + prefix.length + selected.length,
        };
      }
      const insert = selected || action.placeholder || '';
      const newText = `${before}\`${insert}\`${after}`;
      return {
        newValue: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + insert.length,
      };
    }

    case 'link': {
      const linkText = selected || action.placeholder || '';
      const newText = `${before}[${linkText}](url)${after}`;
      if (selected) {
        const urlStart = selectionStart + 1 + linkText.length + 2;
        return { newValue: newText, newSelectionStart: urlStart, newSelectionEnd: urlStart + 3 };
      }
      return {
        newValue: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + linkText.length,
      };
    }

    default:
      return { newValue: text, newSelectionStart: selectionStart, newSelectionEnd: selectionEnd };
  }
}
