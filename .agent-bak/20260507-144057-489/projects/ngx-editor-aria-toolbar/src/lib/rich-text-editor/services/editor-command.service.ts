import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { lowlight } from 'lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

/**
 * Supported block formats for the block-format `<select>` in the toolbar.
 *
 * Kept as a string literal union (not a `NodeType` re-export) so that
 * consumers of this service can switch blocks via a plain string value,
 * which is what the native `<select>` control emits.
 */
export type BlockFormat = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'pre';

/**
 * Toolbar-facing snapshot of the editor state.
 *
 * The shape is load-bearing: the existing Angular Aria toolbar template reads
 * `s.bold`, `s.strikeThrough`, `s.foreColor`, etc., so adding or removing
 * fields here requires a matching template change.
 */
export interface EditorState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  orderedList: boolean;
  unorderedList: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
  foreColor: string;
  backColor: string;
  block: BlockFormat;
  zoom: number;
  codeBlock: boolean;
  taskList: boolean;
  verticalAlign: string;
}

const INITIAL_STATE: EditorState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  orderedList: false,
  unorderedList: false,
  alignLeft: true,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
  foreColor: '#000000',
  backColor: '#ffff00',
  block: 'p',
  zoom: 100,
  codeBlock: false,
  taskList: false,
  verticalAlign: 'baseline',
};

/**
 * Alignment values mapped to TipTap's `TextAlign` extension argument.
 *
 * The toolbar emits Capitalised values (`'Left'`, `'Center'`, `'Right'`,
 * `'Justify'`) for historical reasons; we normalise to lowercase here.
 */
type Alignment = 'Left' | 'Center' | 'Right' | 'Justify';

/**
 * Thin signal-backed facade around a TipTap editor instance.
 *
 * Responsibilities:
 *  - own the Editor lifecycle (create, listen to transactions, destroy)
 *  - mirror the editor's active marks / node types into a `state` signal
 *    consumed by the toolbar template (so the toolbar stays a dumb
 *    Angular-Aria widget that doesn't import TipTap directly)
 *  - expose imperative methods (`toggleBold`, `setBlock`, ...) that the
 *    toolbar wires into click handlers
 *
 * Not responsible for any DOM mounting — {@link RichTextEditorComponent}
 * owns the `<div>` the editor attaches to and calls {@link init} with it.
 */
@Injectable()
export class EditorCommandService {
  /** Public snapshot of editor state for the toolbar template. */
  readonly state = signal<EditorState>(INITIAL_STATE);

  /** Fires every time the editor content changes (on `update`). */
  readonly contentChanged = signal<number>(0);

  private editor: Editor | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private editorElement: HTMLElement | null = null;
  private boundFocusOut: ((e: FocusEvent) => void) | null = null;
  private expectingToolbarSteal = false;

  // === FOCUS TOOLBAR HANDLING (Angular Aria compatible) ===

  constructor() {
    this.destroyRef.onDestroy(() => this.destroy());
  }

  /**
   * À appeler UNE FOIS après init(editorElement)
   */
  registerEditorElement(el: HTMLElement): void {
    // cleanup si re-init
    if (this.editorElement && this.boundFocusOut) {
      this.editorElement.removeEventListener('focusout', this.boundFocusOut);
    }

    this.editorElement = el;

    this.boundFocusOut = (event: FocusEvent) => {
      // si on n'attend pas un click toolbar → on laisse faire
      if (!this.expectingToolbarSteal) return;

      const related = event.relatedTarget as Element | null;

      // si le focus ne va pas vers la toolbar → on ne touche pas
      if (!related?.closest('[ngToolbar]')) return;

      // snapshot du range courant (si dispo)
      const selection = window.getSelection();
      const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

      setTimeout(() => {
        if (!this.editorElement) return;

        const active = document.activeElement;

        const inEditor = active === this.editorElement;
        const inToolbar = active instanceof Element && active.closest('[ngToolbar]') !== null;

        // si l'utilisateur a vraiment changé de focus ailleurs → ne pas forcer
        if (!inEditor && !inToolbar) return;

        this.editorElement.focus();

        if (!savedRange) return;

        const sel = window.getSelection();
        if (!sel) return;

        sel.removeAllRanges();
        try {
          sel.addRange(savedRange);
        } catch {
          // ignore si DOM changé
        }
      }, 0);
    };

    this.editorElement.addEventListener('focusout', this.boundFocusOut);
  }

  /**
   * À appeler sur pointerdown des boutons toolbar
   */
  armToolbarFocusSteal(): void {
    this.expectingToolbarSteal = true;

    setTimeout(() => {
      this.expectingToolbarSteal = false;
    }, 200);
  }

  /**
   * Cleanup
   */
  cleanupEditorElement(): void {
    if (this.editorElement && this.boundFocusOut) {
      this.editorElement.removeEventListener('focusout', this.boundFocusOut);
    }
    this.editorElement = null;
    this.boundFocusOut = null;
  }


  /**
   * Mount a TipTap editor on the given host element with `initialContent`.
   *
   * Safe to call again: any existing editor is destroyed first, so callers
   * don't have to coordinate their own teardown when switching templates
   * (e.g. on mode round-trip). Returns the created `Editor` so the component
   * can hold a reference for imperative tasks (`getHTML()`, `setContent()`).
   */
  init(element: HTMLElement, initialContent = ''): Editor {
    this.destroy();
    this.editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          // StarterKit bundles a History extension under the `undoRedo` key
          // in v3 — keep defaults. Link is also bundled; we leave it on.
        }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
          alignments: ['left', 'center', 'right', 'justify'],
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        CodeBlockLowlight.configure({
          lowlight,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Image.configure({
          inline: false,
          allowBase64: false,
        }),
      ],
      content: initialContent || '<p></p>',
      autofocus: false,
      editable: true,
    });

    this.editor.on('transaction', () => this.refreshState());
    this.editor.on('selectionUpdate', () => this.refreshState());
    this.editor.on('update', () => this.contentChanged.update(n => n + 1));
    this.refreshState();
    return this.editor;
  }

  /** Destroy the underlying TipTap editor; idempotent. */
  destroy(): void {
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
    this.cleanupEditorElement();
    this.state.set(INITIAL_STATE);
  }

  /** Current HTML serialisation, or empty string if no editor is mounted. */
  getHTML(): string {
    return this.editor?.getHTML() ?? '';
  }

  /** Current JSON document serialisation. */
  getJSON(): JSONContent | null {
    return this.editor?.getJSON() ?? null;
  }

  /** Replace the document with new HTML (keeps history by default). */
  setContent(html: string, emitUpdate = false): void {
    this.editor?.commands.setContent(html, { emitUpdate });
  }

  /** Plain-text document length — used by the word/char counter. */
  getTextLength(): number {
    return this.editor?.state.doc.textContent.length ?? 0;
  }

  /** Naive word count on the plain-text document. */
  getWordCount(): number {
    const text = this.editor?.state.doc.textContent ?? '';
    const trimmed = text.trim();
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  }

  // ---------------------------------------------------------------------
  // Toolbar-facing imperative API
  // ---------------------------------------------------------------------

  undo(): void {
    this.editor?.chain().focus().undo().run();
  }

  redo(): void {
    this.editor?.chain().focus().redo().run();
  }

  toggleBold(): void {
    this.editor?.chain().focus().toggleBold().run();
  }

  toggleItalic(): void {
    this.editor?.chain().focus().toggleItalic().run();
  }

  toggleUnderline(): void {
    this.editor?.chain().focus().toggleUnderline().run();
  }

  toggleStrikeThrough(): void {
    this.editor?.chain().focus().toggleStrike().run();
  }

  setAlignment(side: Alignment): void {
    this.editor?.chain().focus().setTextAlign(side.toLowerCase()).run();
  }

  orderedList(): void {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  unorderedList(): void {
    this.editor?.chain().focus().toggleBulletList().run();
  }

  /**
   * Increase indent: if the caret is inside a list item, sink it one level
   * deeper. Outside lists, TipTap has no first-class paragraph indent
   * concept so we intentionally no-op rather than inject arbitrary margins
   * that would diverge from the HTML round-trip story.
   */
  indent(): void {
    this.editor?.chain().focus().sinkListItem('listItem').run();
  }

  /** Decrease indent: lift the current list item out one level. */
  outdent(): void {
    this.editor?.chain().focus().liftListItem('listItem').run();
  }

  setForeColor(color: string): void {
    this.editor?.chain().focus().setColor(color).run();
  }

  setBackColor(color: string): void {
    this.editor?.chain().focus().toggleHighlight({ color }).run();
  }

  createLink(url: string): void {
    if (!url) {
      return;
    }
    this.editor?.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank', rel: 'noopener noreferrer' }).run();
  }

  unlink(): void {
    this.editor?.chain().focus().unsetLink().run();
  }

  insertImage(url: string): void {
    if (!url) {
      return;
    }
    this.editor?.chain().focus().setImage({ src: url }).run();
  }

  insertHorizontalRule(): void {
    this.editor?.chain().focus().setHorizontalRule().run();
  }

  toggleCodeBlock(): void {
    this.editor?.chain().focus().toggleCodeBlock().run();
  }

  toggleTaskList(): void {
    this.editor?.chain().focus().toggleTaskList().run();
  }

  setVerticalAlign(align: string): void {
    this.editor?.chain().focus().setTextAlign(align).run();
  }

  insertTable(rows: number, cols: number): void {
    this.editor?.chain().focus().insertTable({ rows, cols }).run();
  }

  exportHtml(): void {
    const html = this.getHTML();
    navigator.clipboard.writeText(html).then(() => {
      alert('HTML exported to clipboard!');
    });
  }

  importHtml(): void {
    const html = prompt('Paste your HTML content:');
    if (html) {
      this.setContent(html, true);
    }
  }

  increaseZoom(): void {
    this.state.update(s => ({ ...s, zoom: Math.min(s.zoom + 10, 200) }));
  }

  decreaseZoom(): void {
    this.state.update(s => ({ ...s, zoom: Math.max(s.zoom - 10, 50) }));
  }

  resetZoom(): void {
    this.state.update(s => ({ ...s, zoom: 100 }));
  }

  /**
   * Strip all inline marks and reset the block-level nodes touched by the
   * current selection back to plain paragraphs. Equivalent to the old
   * `document.execCommand('removeFormat')` + `clearNodes` combo.
   */
  removeFormat(): void {
    this.editor?.chain().focus().clearNodes().unsetAllMarks().run();
  }

  /**
   * Change the block containing the selection to `block`. The `<select>`
   * in the toolbar is a controlled input bound to `state().block`, so
   * this is the single entry point for block-format changes (keyboard
   * shortcuts aside).
   */
  setBlock(block: BlockFormat): void {
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    switch (block) {
      case 'p':
        chain.setParagraph().run();
        break;
      case 'h1':
        chain.setHeading({ level: 1 }).run();
        break;
      case 'h2':
        chain.setHeading({ level: 2 }).run();
        break;
      case 'h3':
        chain.setHeading({ level: 3 }).run();
        break;
      case 'h4':
        chain.setHeading({ level: 4 }).run();
        break;
      case 'blockquote':
        chain.setBlockquote().run();
        break;
      case 'pre':
        chain.setCodeBlock().run();
        break;
    }
  }

  /** Recompute the toolbar state snapshot from the live editor. */
  private refreshState(): void {
    console.log('refreshState')

    const editor = this.editor;
    if (!editor) {
      return;
    }
    console.log('refreshState editor')

    const align =
      (editor.getAttributes('paragraph')['textAlign'] as string | undefined) ??
      (editor.getAttributes('heading')['textAlign'] as string | undefined) ??
      'left';

    let block: BlockFormat = 'p';
    if (editor.isActive('heading', { level: 1 })) {
      block = 'h1';
    } else if (editor.isActive('heading', { level: 2 })) {
      block = 'h2';
    } else if (editor.isActive('heading', { level: 3 })) {
      block = 'h3';
    } else if (editor.isActive('heading', { level: 4 })) {
      block = 'h4';
    } else if (editor.isActive('blockquote')) {
      block = 'blockquote';
    } else if (editor.isActive('codeBlock')) {
      block = 'pre';
    }
    console.log('refreshState block', JSON.stringify(this.state()))

    const codeBlock = editor.isActive('codeBlock');
    const taskList = editor.isActive('taskItem');
    const verticalAlign = (editor.getAttributes('textStyle')['verticalAlign'] as string | undefined) ?? 'baseline';

    this.state.set({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strikeThrough: editor.isActive('strike'),
      orderedList: editor.isActive('orderedList'),
      unorderedList: editor.isActive('bulletList'),
      alignLeft: align === 'left',
      alignCenter: align === 'center',
      alignRight: align === 'right',
      alignJustify: align === 'justify',
      foreColor: (editor.getAttributes('textStyle')['color'] as string | undefined) ?? '#000000',
      backColor: (editor.getAttributes('highlight')['color'] as string | undefined) ?? '#ffff00',
      block,
      zoom: INITIAL_STATE.zoom,
      codeBlock,
      taskList,
      verticalAlign,
    });
  }
}
