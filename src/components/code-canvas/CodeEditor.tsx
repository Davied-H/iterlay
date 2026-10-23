import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { vue } from '@codemirror/lang-vue';
import { tags } from '@lezer/highlight';
import type { CanvasFramework } from '@shared/types';
import { CANVAS_CODE_LIMIT } from './model';
import { formatCanvasCode } from './format-code';

interface Props {
  code: string;
  framework: CanvasFramework;
  onChange: (code: string) => void;
  onCommit: () => void;
}
const language = (framework: CanvasFramework) => framework === 'react' ? javascript({ jsx: true }) : framework === 'vue' ? vue() : html();
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.attributeValue], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: [tags.tagName, tags.className, tags.typeName], color: 'var(--code-type)' },
  { tag: [tags.attributeName, tags.propertyName, tags.function(tags.variableName)], color: 'var(--code-property)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' }
]);
export default function CodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef(props); current.current = props;
  const languageSlot = useRef(new Compartment());
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let formattingTimer: ReturnType<typeof setTimeout> | undefined;
    const format = async () => {
      const editor = view.current;
      if (!editor || editor.composing) return;
      const code = editor.state.doc.toString();
      const framework = current.current.framework;
      try {
        const formatted = await formatCanvasCode(code, framework);
        if (disposed || view.current !== editor || current.current.framework !== framework || editor.state.doc.toString() !== code || editor.composing) return;
        if (formatted !== code && formatted.length <= CANVAS_CODE_LIMIT) {
          const cursor = Math.min(editor.state.selection.main.head, formatted.length);
          editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: formatted }, selection: { anchor: cursor } });
        }
        current.current.onCommit();
      } catch {
        // Incomplete code stays editable. Runtime errors appear in the preview.
        if (!disposed) current.current.onCommit();
      }
    };
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: current.current.code, extensions: [
        lineNumbers(), foldGutter(), highlightSpecialChars(), history(), indentOnInput(), bracketMatching(), highlightActiveLine(),
        languageSlot.current.of(language(current.current.framework)), syntaxHighlighting(colors),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Canvas 代码', spellcheck: 'false' }),
        EditorState.transactionFilter.of(transaction => transaction.newDoc.length > CANVAS_CODE_LIMIT ? [] : transaction),
        keymap.of([{ key: 'Mod-Shift-f', run: () => { void format(); return true; } }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of(update => { if (update.docChanged) current.current.onChange(update.state.doc.toString()); }),
        EditorView.domEventHandlers({ blur: () => { current.current.onCommit(); void format(); } })
      ] })
    });
    view.current = editor;
    formattingTimer = setTimeout(() => { if (!editor.hasFocus) void format(); }, 200);
    return () => { disposed = true; clearTimeout(formattingTimer); editor.destroy(); view.current = null; };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === props.code) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.code } });
  }, [props.code]);
  useEffect(() => { view.current?.dispatch({ effects: languageSlot.current.reconfigure(language(props.framework)) }); }, [props.framework]);
  return <div ref={host} className="code-canvas__editor" />;
}
