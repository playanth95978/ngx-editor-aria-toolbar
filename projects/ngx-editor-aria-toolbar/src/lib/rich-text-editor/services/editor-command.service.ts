import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type BlockFormat = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'pre';

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
  block: BlockFormat;
  foreColor: string;
  backColor: string;
}

const DEFAULT_STATE: EditorState = {
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
  block: 'p',
  foreColor: '#1d1d1f',
  backColor: '#ffffff',
};

const BLOCK_TAGS: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li', 'div']);
const VALID_BLOCK_FORMATS: ReadonlySet<BlockFormat> = new Set<BlockFormat>(['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre']);
const INLINE_FORMAT_TAGS: ReadonlySet<string> = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'font']);
const HISTORY_CAP = 100;
const INDENT_STEP_PX = 32;

/**
 * Rich text editor command service — modern, `execCommand`-free implementation.
 *
 * Every command manipulates the contentEditable DOM directly through the
 * Selection / Range APIs. An undo / redo stack of `innerHTML` snapshots is
 * maintained internally and the toolbar's `state` signal is derived by
 * walking the current selection's ancestor chain whenever the selection or
 * the DOM changes.
 */
@Injectable()
export class EditorCommandService {
  readonly state = signal<EditorState>({ ...DEFAULT_STATE });
  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);

  private editorElement: HTMLElement | null = null;
  private savedRange: Range | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private suppressInputSnapshot = false;
  private boundInput: EventListener | null = null;
  private boundSelectionChange: EventListener | null = null;
  private boundFocusOut: EventListener | null = null;

  /**
   * True between the moment a toolbar pointer interaction starts and the
   * next tick. Used by the editor's `focusout` handler to distinguish
   * between a user deliberately Tab-ing to the toolbar (we leave them
   * alone) and Angular Aria's roving-focus programmatic `focus()` call
   * on the clicked button (we reverse it so typing continues in the
   * editor).
   */
  private expectingToolbarSteal = false;

  constructor() {
    // The service is provided at component scope (see RichTextEditorComponent
    // `providers`), so tear down the document-level selectionchange listener
    // and the editor's input listener when the host component is destroyed.
    inject(DestroyRef).onDestroy(() => {
      if (this.boundSelectionChange) {
        document.removeEventListener('selectionchange', this.boundSelectionChange);
        this.boundSelectionChange = null;
      }
      if (this.editorElement && this.boundInput) {
        this.editorElement.removeEventListener('input', this.boundInput);
      }
      if (this.editorElement && this.boundFocusOut) {
        this.editorElement.removeEventListener('focusout', this.boundFocusOut);
      }
      this.editorElement = null;
      this.boundInput = null;
      this.boundFocusOut = null;
    });
  }

  registerEditor(element: HTMLElement): void {
    if (this.editorElement && this.editorElement !== element && this.boundInput) {
      this.editorElement.removeEventListener('input', this.boundInput);
    }
    if (this.editorElement && this.editorElement !== element && this.boundFocusOut) {
      this.editorElement.removeEventListener('focusout', this.boundFocusOut);
    }
    this.boundInput ??= (): void => this.onInput();
    this.boundFocusOut ??= (event: Event): void => this.onEditorFocusOut(event as FocusEvent);
    if (!this.boundSelectionChange) {
      const handler: EventListener = (): void => this.onSelectionChange();
      this.boundSelectionChange = handler;
      document.addEventListener('selectionchange', handler);
    }
    this.editorElement = element;
    this.savedRange = null;
    this.undoStack = [element.innerHTML];
    this.redoStack = [];
    this.syncHistorySignals();
    element.addEventListener('input', this.boundInput);
    element.addEventListener('focusout', this.boundFocusOut);
  }

  /**
   * Called by the toolbar component on pointerdown of a widget button to
   * arm the focus-steal reversal. See `onEditorFocusOut` for the full
   * story — the short version is that Angular Aria calls `.focus()` on the
   * clicked button synchronously inside its `(click)` handler, which
   * evicts the contentEditable. We can't block that focus call, so
   * instead we catch it in `focusout` and bounce focus back to the
   * editor. The flag ensures we only bounce for mouse/pointer
   * interactions, not for keyboard Tab navigation into the toolbar.
   */
  armToolbarFocusSteal(): void {
    this.expectingToolbarSteal = true;
    setTimeout(() => {
      this.expectingToolbarSteal = false;
    }, 200);
  }

  focus(): void {
    this.editorElement?.focus();
  }

  // === Inline formatting =====================================================

  toggleBold(): void {
    this.toggleInlineWrap('strong');
  }

  toggleItalic(): void {
    this.toggleInlineWrap('em');
  }

  toggleUnderline(): void {
    this.toggleInlineWrap('u');
  }

  toggleStrikeThrough(): void {
    this.toggleInlineWrap('s');
  }

  // === Block formatting ======================================================

  setBlock(block: BlockFormat): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (!range) {
      return;
    }
    const rangeWasCollapsed = range.collapsed;
    // Snapshot the original range's boundaries before mutating the DOM. Text
    // nodes retain their identity when moved via `appendChild`, so these
    // containers remain valid inside the replacement element after we swap
    // the block tag. This is what makes the UX feel fluid: the caret stays
    // exactly where the user left it instead of the whole block being
    // selected afterwards (Google Docs / MS Word parity).
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    const blocks = this.currentBlocks();
    if (!blocks.length) {
      return;
    }
    const replacements: HTMLElement[] = [];
    let anyReplaced = false;
    for (const blockEl of blocks) {
      if (blockEl.tagName.toLowerCase() === block) {
        replacements.push(blockEl);
        continue;
      }
      const replacement = document.createElement(block);
      if (blockEl.style.textAlign) {
        replacement.style.textAlign = blockEl.style.textAlign;
      }
      if (blockEl.style.paddingLeft) {
        replacement.style.paddingLeft = blockEl.style.paddingLeft;
      }
      while (blockEl.firstChild) {
        replacement.appendChild(blockEl.firstChild);
      }
      blockEl.replaceWith(replacement);
      replacements.push(replacement);
      anyReplaced = true;
    }
    if (!anyReplaced) {
      // Every target block already had the requested tag — don't disturb the
      // user's selection. Still refresh state so the toolbar's `<select>`
      // reflects reality if it was out of sync.
      this.refreshState();
      return;
    }
    if (rangeWasCollapsed) {
      this.restoreCaretAfterBlockChange(replacements[0], startContainer, startOffset);
    } else {
      this.restoreRangeAfterBlockChange(replacements, startContainer, startOffset, endContainer, endOffset);
    }
    this.commit();
  }

  setAlignment(align: 'Left' | 'Center' | 'Right' | 'Justify'): void {
    this.restoreSelection();
    const blocks = this.currentBlocks();
    if (!blocks.length) {
      return;
    }
    const value = align.toLowerCase();
    for (const block of blocks) {
      block.style.textAlign = value;
    }
    this.commit();
  }

  // === Lists =================================================================

  orderedList(): void {
    this.toggleList('ol');
  }

  unorderedList(): void {
    this.toggleList('ul');
  }

  indent(): void {
    this.adjustIndent(INDENT_STEP_PX);
  }

  outdent(): void {
    this.adjustIndent(-INDENT_STEP_PX);
  }

  // === History ===============================================================

  undo(): void {
    if (!this.editorElement || this.undoStack.length < 2) {
      return;
    }
    const current = this.undoStack.pop();
    if (current !== undefined) {
      this.redoStack.push(current);
    }
    const previous = this.undoStack[this.undoStack.length - 1];
    this.restoreSnapshot(previous);
  }

  redo(): void {
    if (!this.editorElement || !this.redoStack.length) {
      return;
    }
    const next = this.redoStack.pop();
    if (next === undefined) {
      return;
    }
    this.undoStack.push(next);
    this.restoreSnapshot(next);
  }

  // === Colors ================================================================

  setForeColor(color: string): void {
    this.applyInlineStyle('color', color);
    this.state.update(s => ({ ...s, foreColor: color }));
  }

  setBackColor(color: string): void {
    this.applyInlineStyle('background-color', color);
    this.state.update(s => ({ ...s, backColor: color }));
  }

  // === Links / inserts =======================================================

  createLink(url: string): void {
    if (!url || !this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (!range || range.collapsed) {
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    this.wrapRange(range, anchor);
    this.commit();
  }

  unlink(): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const anchor = this.findAncestor(this.currentRange()?.commonAncestorContainer ?? null, 'a');
    if (!anchor || !this.editorElement.contains(anchor)) {
      return;
    }
    this.unwrapElement(anchor);
    this.commit();
  }

  insertHorizontalRule(): void {
    this.insertNode(document.createElement('hr'));
  }

  insertImage(url: string): void {
    if (!url) {
      return;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    this.insertNode(img);
  }

  // === Cleanup ===============================================================

  removeFormat(): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (!range || range.collapsed) {
      return;
    }
    const plain = range.toString();
    range.deleteContents();
    const textNode = document.createTextNode(plain);
    range.insertNode(textNode);
    // Walk up from the text node and unwrap every inline-formatting ancestor
    // (bold/italic/underline/strike/font/etc.) until the nearest block.
    const inlineAncestors: HTMLElement[] = [];
    let current: Node | null = textNode.parentNode;
    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (INLINE_FORMAT_TAGS.has(tag)) {
          inlineAncestors.push(el);
        } else if (BLOCK_TAGS.has(tag)) {
          break;
        }
      }
      current = current.parentNode;
    }
    for (const el of inlineAncestors) {
      this.unwrapElement(el);
    }
    // Also strip any descendant formatting tags that survived the extract.
    this.flattenInlineFormatting(textNode.parentElement ?? this.editorElement);
    this.selectNode(textNode);
    this.commit();
  }

  reset(): void {
    if (!this.editorElement) {
      return;
    }
    this.editorElement.innerHTML = '';
    this.savedRange = null;
    this.undoStack = [''];
    this.redoStack = [];
    this.state.set({ ...DEFAULT_STATE });
    this.syncHistorySignals();
  }

  // === State inspection ======================================================

  refreshState(): void {
    if (!this.editorElement) {
      return;
    }
    const range = this.currentRange();
    const node: Node | null = range && this.editorElement.contains(range.commonAncestorContainer) ? range.commonAncestorContainer : null;
    const tags = this.ancestorTagSet(node);
    const blockEl = this.findBlock(node);
    const blockTag = blockEl ? blockEl.tagName.toLowerCase() : 'p';
    const block: BlockFormat = VALID_BLOCK_FORMATS.has(blockTag as BlockFormat) ? (blockTag as BlockFormat) : 'p';
    const align = (blockEl?.style.textAlign ?? '').toLowerCase();

    this.state.set({
      bold: tags.has('strong') || tags.has('b'),
      italic: tags.has('em') || tags.has('i'),
      underline: tags.has('u'),
      strikeThrough: tags.has('s') || tags.has('strike'),
      orderedList: tags.has('ol'),
      unorderedList: tags.has('ul'),
      alignLeft: align === '' || align === 'left' || align === 'start',
      alignCenter: align === 'center',
      alignRight: align === 'right' || align === 'end',
      alignJustify: align === 'justify',
      block,
      foreColor: this.state().foreColor,
      backColor: this.state().backColor,
    });
  }

  // === Private helpers =======================================================

  private onSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.editorElement) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.editorElement.contains(range.commonAncestorContainer)) {
      return;
    }
    // Angular Aria's toolbar moves focus to the active widget programmatically
    // (`listBehavior.goto()` with `focusMode: 'roving'`) after a click, which
    // `preventDefault` on pointerdown/mousedown cannot block. When that happens
    // the browser fires a `selectionchange` with a COLLAPSED range inside the
    // editor right before our command handler reads `savedRange`. Without this
    // guard we'd clobber the user's real selection with that collapsed one and
    // commands like `toggleBold()` would see a collapsed range and bail out.
    //
    // Rule: only overwrite `savedRange` when we can trust the event represents
    // a deliberate user selection — either the range has actual content, or
    // the editor still owns focus (meaning the user is moving the caret inside
    // the editor themselves, not being evicted by a toolbar widget).
    const editorHasFocus = document.activeElement === this.editorElement;
    if (range.collapsed && !editorHasFocus && this.savedRange) {
      return;
    }
    this.savedRange = range.cloneRange();
    this.refreshState();
  }

  private onInput(): void {
    if (this.suppressInputSnapshot) {
      return;
    }
    this.snapshot();
  }

  private snapshot(): void {
    if (!this.editorElement) {
      return;
    }
    const current = this.editorElement.innerHTML;
    const top = this.undoStack[this.undoStack.length - 1];
    if (top === current) {
      return;
    }
    this.undoStack.push(current);
    if (this.undoStack.length > HISTORY_CAP) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.syncHistorySignals();
  }

  private commit(): void {
    this.snapshot();
    this.captureSelection();
    this.refreshState();
  }

  private restoreSnapshot(html: string): void {
    if (!this.editorElement) {
      return;
    }
    this.suppressInputSnapshot = true;
    this.editorElement.innerHTML = html;
    this.suppressInputSnapshot = false;
    this.savedRange = null;
    this.syncHistorySignals();
    this.refreshState();
  }

  private syncHistorySignals(): void {
    this.canUndo.set(this.undoStack.length > 1);
    this.canRedo.set(this.redoStack.length > 0);
  }

  private captureSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !this.editorElement) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (this.editorElement.contains(range.commonAncestorContainer)) {
      this.savedRange = range.cloneRange();
    }
  }

  private restoreSelection(): void {
    if (!this.editorElement) {
      return;
    }
    // Snapshot the saved range BEFORE calling focus(). Focus can synchronously
    // trigger `selectionchange`, which re-enters `onSelectionChange` and could
    // rewrite `this.savedRange` to whatever default selection the browser puts
    // in when focus lands on the editor (often a collapsed caret at the end of
    // the content). Capturing into a local ensures we restore the real
    // user-intended selection regardless of what the browser does mid-focus.
    const snapshot = this.savedRange;
    this.editorElement.focus();
    if (!snapshot) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(snapshot);
  }

  private currentRange(): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    return selection.getRangeAt(0);
  }

  private toggleInlineWrap(tag: string): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (!range) {
      return;
    }
    if (range.collapsed) {
      this.toggleInlineWrapAtCaret(range, tag);
      return;
    }
    const existing = this.findAncestor(range.commonAncestorContainer, tag);
    if (existing && this.editorElement.contains(existing)) {
      const preservedRange = range.cloneRange();
      this.unwrapElement(existing);
      this.normalizeBoundary(preservedRange);
    } else {
      const wrapper = document.createElement(tag);
      this.wrapRange(range, wrapper);
    }
    this.commit();
  }

  /**
   * Reverse Angular Aria's focus-steal after a toolbar button click.
   *
   * Background: Aria's `ToolbarPattern` runs its `onClick` listener on the
   * `[ngToolbar]` host during the click bubble phase and synchronously
   * calls `item.element().focus()` on the clicked button
   * (`focusMode: 'roving'` in `_list-navigation-chunk.mjs#49`).
   * `preventDefault` on `pointerdown` / `mousedown` cannot block that
   * programmatic focus call — it only blocks the browser's default focus
   * transfer. An earlier fix tried to queue a `queueMicrotask` refocus
   * from inside our command handler; this failed empirically in Chrome
   * 141 (typing after Bold landed zero characters because focus was still
   * on the button when keystrokes dispatched), strongly suggesting that
   * in zone.js the microtask ordering between our refocus and Aria's
   * effects is not guaranteed.
   *
   * Robust fix: attach a `focusout` listener to the editor that reacts
   * whenever the editor loses focus to a toolbar widget. We then schedule
   * a `setTimeout(0)` — a true macrotask that runs strictly AFTER every
   * microtask and synchronous work in the current click dispatch — to
   * move focus back and re-apply `savedRange`. The `expectingToolbarSteal`
   * flag, set by the toolbar component on pointerdown, ensures we only
   * bounce focus for mouse/pointer interactions. Users who Tab into the
   * toolbar from the keyboard are left alone.
   */
  private onEditorFocusOut(event: FocusEvent): void {
    if (!this.expectingToolbarSteal) {
      return;
    }
    const related = event.relatedTarget as Element | null;
    if (!related?.closest('[ngToolbar]')) {
      return;
    }
    const savedRange = this.savedRange ? this.savedRange.cloneRange() : null;
    setTimeout(() => {
      if (!this.editorElement) {
        return;
      }
      // If focus has landed somewhere genuinely outside both the editor
      // and the toolbar in the meantime (e.g. user clicked elsewhere on
      // the page), leave it alone — don't hijack their intent.
      const active = document.activeElement;
      const inEditor = active === this.editorElement;
      const inToolbar = active instanceof Element && active.closest('[ngToolbar]') !== null;
      if (!inEditor && !inToolbar) {
        return;
      }
      this.editorElement.focus();
      if (!savedRange) {
        return;
      }
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      selection.removeAllRanges();
      try {
        selection.addRange(savedRange);
      } catch {
        // Saved range may reference detached nodes after a structural
        // edit; the focus() call alone is enough to keep typing going.
      }
    }, 0);
  }

  /**
   * Handle the "no selection, user just clicked Bold/Italic/…" case.
   *
   * Matches the standard Google Docs / MS Word behaviour: clicking an inline
   * format button with a collapsed caret should put the caret into that
   * format so subsequent typed characters inherit it. We implement this by
   * inserting an empty `<tag>\u200B</tag>` at the caret (the zero-width
   * space is invisible but gives the caret a text node to live inside) and
   * placing the caret right after the ZWSP, inside the new wrapper.
   *
   * Re-clicking the same button while the caret is still inside a matching
   * empty wrapper unwraps it, so the user can toggle the mode off.
   */
  private toggleInlineWrapAtCaret(range: Range, tag: string): void {
    if (!this.editorElement) {
      return;
    }
    const existing = this.findAncestor(range.commonAncestorContainer, tag);
    if (existing && this.editorElement.contains(existing)) {
      // Caret already inside a matching wrapper. If the wrapper only holds a
      // ZWSP "seed" we planted on a previous click, remove it entirely so
      // the mode toggles cleanly off. Otherwise leave the wrapper alone and
      // just hop the caret out right after it.
      const parent = existing.parentNode;
      if (!parent) {
        return;
      }
      const selection = window.getSelection();
      const onlySeed = existing.textContent === '\u200B' || existing.textContent === '';
      const newRange = document.createRange();
      if (onlySeed) {
        const anchor = existing.nextSibling ?? parent;
        const offset = existing.nextSibling ? 0 : parent.childNodes.length - 1;
        parent.removeChild(existing);
        newRange.setStart(anchor, offset);
        newRange.setEnd(anchor, offset);
      } else {
        const idx = Array.from(parent.childNodes).indexOf(existing) + 1;
        newRange.setStart(parent, idx);
        newRange.setEnd(parent, idx);
      }
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
        this.savedRange = newRange.cloneRange();
      }
      this.commit();
      return;
    }
    const wrapper = document.createElement(tag);
    const seed = document.createTextNode('\u200B');
    wrapper.appendChild(seed);
    range.insertNode(wrapper);
    const newRange = document.createRange();
    newRange.setStart(seed, 1);
    newRange.setEnd(seed, 1);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(newRange);
      this.savedRange = newRange.cloneRange();
    }
    this.commit();
  }

  private wrapRange(range: Range, wrapper: HTMLElement): void {
    try {
      range.surroundContents(wrapper);
    } catch {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
    }
    this.selectNode(wrapper);
  }

  private unwrapElement(element: Element): void {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  }

  private normalizeBoundary(range: Range): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
    try {
      selection.addRange(range);
    } catch {
      // Range may reference detached nodes after unwrap; ignore.
    }
  }

  private findAncestor(node: Node | null, tag: string): HTMLElement | null {
    let current: Node | null = node;
    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as HTMLElement;
        if (element.tagName.toLowerCase() === tag) {
          return element;
        }
      }
      current = current.parentNode;
    }
    return null;
  }

  private findBlock(node: Node | null): HTMLElement | null {
    let current: Node | null = node;
    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as HTMLElement;
        if (BLOCK_TAGS.has(element.tagName.toLowerCase())) {
          return element;
        }
      }
      current = current.parentNode;
    }
    return null;
  }

  /**
   * Resolve a range endpoint that's positioned at the editor element itself
   * (`container === editorElement`, `offset = N`) down to the child node at
   * that offset. contentEditable frequently reports the caret that way —
   * especially right after typing the first character into an empty block —
   * and both `findBlock` and `ensureTopLevelBlock` return `null` for the
   * editor div itself, which silently breaks every command that walks from
   * `range.startContainer` (setBlock, setAlignment, toggleList, etc.).
   *
   * `which` distinguishes start vs end endpoints because the Range spec
   * interprets them asymmetrically: `startOffset = N` means "at/before child
   * N" with child N included, while `endOffset = N` means child N is
   * *excluded* and the last covered child is N − 1. Treating both the same
   * way would include one extra trailing block when the user selects across
   * blocks from inside the editor.
   */
  private resolveRangeEndpoint(container: Node, offset: number, which: 'start' | 'end'): Node {
    // If the container isn't the editor root itself we already have a
    // descendant; findBlock/ensureTopLevelBlock will handle it normally.
    if (container !== this.editorElement) {
      return container;
    }
    const children = container.childNodes;
    if (children.length === 0) {
      return container;
    }
    let idx = offset;
    if (which === 'end' && idx > 0) {
      idx--;
    }
    idx = Math.min(Math.max(idx, 0), children.length - 1);
    return children[idx];
  }

  private currentBlocks(): HTMLElement[] {
    const range = this.currentRange();
    if (!range || !this.editorElement) {
      return [];
    }
    const startNode = this.resolveRangeEndpoint(range.startContainer, range.startOffset, 'start');
    // For a collapsed range the endpoint refers to the exact same position,
    // so reuse the start resolution to avoid picking the block before the
    // caret (which would happen with the `end` off-by-one rule).
    const endNode = range.collapsed ? startNode : this.resolveRangeEndpoint(range.endContainer, range.endOffset, 'end');
    const startBlock = this.findBlock(startNode) ?? this.ensureTopLevelBlock(startNode);
    const endBlock = this.findBlock(endNode) ?? this.ensureTopLevelBlock(endNode);
    if (!startBlock || !endBlock) {
      return [];
    }
    if (startBlock === endBlock) {
      return [startBlock];
    }
    const blocks: HTMLElement[] = [];
    let include = false;
    for (const descendant of this.iterateBlocks(this.editorElement)) {
      if (descendant === startBlock) {
        include = true;
      }
      if (include) {
        blocks.push(descendant);
      }
      if (descendant === endBlock) {
        break;
      }
    }
    return blocks.length ? blocks : [startBlock];
  }

  private *iterateBlocks(root: HTMLElement): IterableIterator<HTMLElement> {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n: Node) => (BLOCK_TAGS.has((n as Element).tagName.toLowerCase()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    let current = walker.nextNode() as HTMLElement | null;
    while (current) {
      yield current;
      current = walker.nextNode() as HTMLElement | null;
    }
  }

  private ensureTopLevelBlock(node: Node): HTMLElement | null {
    if (!this.editorElement) {
      return null;
    }
    let target: Node | null = node;
    while (target && target.parentNode !== this.editorElement) {
      target = target.parentNode;
    }
    if (!target) {
      return null;
    }
    if (target.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((target as Element).tagName.toLowerCase())) {
      return target as HTMLElement;
    }
    const paragraph = document.createElement('p');
    this.editorElement.insertBefore(paragraph, target);
    paragraph.appendChild(target);
    return paragraph;
  }

  private selectNode(node: Node): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    this.savedRange = range.cloneRange();
  }

  /**
   * Keep the caret exactly where it was after a block tag change.
   *
   * The text nodes from the old block were moved (not cloned) into the
   * replacement via `appendChild`, so their identity is preserved. If the
   * original container is still connected to the document and lives inside
   * the replacement, we just re-apply the collapsed range. Otherwise (the
   * original block was empty, so there was no text node to move) we place
   * the caret at the start of the replacement.
   */
  private restoreCaretAfterBlockChange(firstReplacement: HTMLElement, startContainer: Node, startOffset: number): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const newRange = document.createRange();
    if (startContainer.isConnected && firstReplacement.contains(startContainer)) {
      newRange.setStart(startContainer, startOffset);
      newRange.setEnd(startContainer, startOffset);
    } else {
      newRange.setStart(firstReplacement, 0);
      newRange.setEnd(firstReplacement, 0);
    }
    selection.removeAllRanges();
    try {
      selection.addRange(newRange);
      this.savedRange = newRange.cloneRange();
    } catch {
      this.selectAcrossElements([firstReplacement]);
    }
  }

  /**
   * Preserve a multi-block selection across a block tag change.
   *
   * If both original boundaries are still inside the replacements we re-apply
   * them verbatim; otherwise we fall back to spanning the replacements so
   * the user still has a visible selection to operate on.
   */
  private restoreRangeAfterBlockChange(
    replacements: HTMLElement[],
    startContainer: Node,
    startOffset: number,
    endContainer: Node,
    endOffset: number,
  ): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const startInside = startContainer.isConnected && replacements.some(r => r.contains(startContainer));
    const endInside = endContainer.isConnected && replacements.some(r => r.contains(endContainer));
    if (!startInside || !endInside) {
      this.selectAcrossElements(replacements);
      return;
    }
    const newRange = document.createRange();
    try {
      newRange.setStart(startContainer, startOffset);
      newRange.setEnd(endContainer, endOffset);
      selection.removeAllRanges();
      selection.addRange(newRange);
      this.savedRange = newRange.cloneRange();
    } catch {
      this.selectAcrossElements(replacements);
    }
  }

  private selectAcrossElements(elements: HTMLElement[]): void {
    if (!elements.length) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
    selection.removeAllRanges();
    selection.addRange(range);
    this.savedRange = range.cloneRange();
  }

  private toggleList(kind: 'ol' | 'ul'): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const blocks = this.currentBlocks();
    if (!blocks.length) {
      return;
    }
    const other: 'ol' | 'ul' = kind === 'ol' ? 'ul' : 'ol';
    const firstParentList = blocks[0].closest(kind);
    if (firstParentList && this.editorElement.contains(firstParentList)) {
      this.unwrapList(firstParentList);
      this.commit();
      return;
    }
    const existingOtherList = blocks[0].closest(other);
    if (existingOtherList && this.editorElement.contains(existingOtherList)) {
      const replacement = document.createElement(kind);
      while (existingOtherList.firstChild) {
        replacement.appendChild(existingOtherList.firstChild);
      }
      existingOtherList.replaceWith(replacement);
      this.selectNode(replacement);
      this.commit();
      return;
    }
    const list = document.createElement(kind);
    for (const block of blocks) {
      const item = document.createElement('li');
      while (block.firstChild) {
        item.appendChild(block.firstChild);
      }
      list.appendChild(item);
    }
    const firstBlock = blocks[0];
    firstBlock.parentNode?.insertBefore(list, firstBlock);
    for (const block of blocks) {
      block.remove();
    }
    this.selectNode(list);
    this.commit();
  }

  private unwrapList(list: Element): void {
    const parent = list.parentNode;
    if (!parent) {
      return;
    }
    const fragments: HTMLElement[] = [];
    for (const item of Array.from(list.children)) {
      if (item.tagName.toLowerCase() !== 'li') {
        continue;
      }
      const paragraph = document.createElement('p');
      while (item.firstChild) {
        paragraph.appendChild(item.firstChild);
      }
      fragments.push(paragraph);
    }
    for (const paragraph of fragments) {
      parent.insertBefore(paragraph, list);
    }
    parent.removeChild(list);
    if (fragments.length) {
      this.selectAcrossElements(fragments);
    }
  }

  private adjustIndent(deltaPx: number): void {
    this.restoreSelection();
    const blocks = this.currentBlocks();
    if (!blocks.length) {
      return;
    }
    for (const block of blocks) {
      const current = parseInt(block.style.paddingLeft || '0', 10);
      const next = Math.max(0, current + deltaPx);
      block.style.paddingLeft = next ? `${next}px` : '';
    }
    this.commit();
  }

  private applyInlineStyle(property: string, value: string): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (!range || range.collapsed) {
      return;
    }
    const span = document.createElement('span');
    span.style.setProperty(property, value);
    this.wrapRange(range, span);
    this.commit();
  }

  private insertNode(node: Node): void {
    if (!this.editorElement) {
      return;
    }
    this.restoreSelection();
    const range = this.currentRange();
    if (range && this.editorElement.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
      const after = document.createRange();
      after.setStartAfter(node);
      after.collapse(true);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(after);
        this.savedRange = after.cloneRange();
      }
    } else {
      this.editorElement.appendChild(node);
    }
    this.commit();
  }

  private flattenInlineFormatting(scope: Element | null): void {
    if (!scope) {
      return;
    }
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>([...INLINE_FORMAT_TAGS].join(',')));
    for (const element of candidates) {
      this.unwrapElement(element);
    }
  }

  private ancestorTagSet(node: Node | null): Set<string> {
    const tags = new Set<string>();
    let current: Node | null = node;
    while (current && current !== this.editorElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        tags.add((current as Element).tagName.toLowerCase());
      }
      current = current.parentNode;
    }
    return tags;
  }
}
