import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  type OnInit,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { EditorToolbarComponent } from './components/editor-toolbar/editor-toolbar';
import { BlockFormat, EditorCommandService } from './services/editor-command.service';
import {
  DEFAULT_I18N,
  type DeepPartial,
  type EditorViewMode,
  type RichTextEditorConfig,
  type RichTextEditorI18n,
  mergeConfig,
  mergeI18n,
} from './editor-config';

@Component({
  selector: 'jhi-rich-text-editor',
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [EditorCommandService],
  imports: [CommonModule, EditorToolbarComponent],
})
export default class RichTextEditorComponent implements OnInit {
  /** HTML to display on first render. Consumers can pass either plain text or a full fragment. */
  readonly initialValue = input<string>('');

  /** Visibility flags, mode subset, storage key. See {@link RichTextEditorConfig}. */
  readonly config = input<RichTextEditorConfig>({});

  /** Labels. Pass a partial; defaults fill the rest. See {@link RichTextEditorI18n}. */
  readonly i18n = input<DeepPartial<RichTextEditorI18n>>(DEFAULT_I18N);

  /** Fires on every WYSIWYG input + HTML edit + mode switch. Carries the current HTML. */
  readonly contentChange = output<string>();

  /**
   * Fires when the user triggers "Save draft" (button click or Ctrl+S). Carries the HTML
   * that was persisted to localStorage. Fires even when `config.storageKey` is `null`, so
   * consumers can implement their own persistence.
   */
  readonly draftSaved = output<string>();

  readonly editorRef = viewChild<ElementRef<HTMLDivElement>>('editor');

  readonly editor = inject(EditorCommandService);
  readonly mode = signal<EditorViewMode>('wysiwyg');
  readonly htmlContent = signal<string>('');
  readonly wordCount = computed(() => {
    const text = this.htmlContent().replace(/<[^>]+>/g, ' ');
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length;
  });
  readonly charCount = computed(() => this.htmlContent().replace(/<[^>]+>/g, '').length);
  readonly savedAt = signal<Date | null>(null);

  readonly resolvedConfig = computed(() => mergeConfig(this.config()));
  readonly labels = computed(() => mergeI18n(this.i18n()));

  private readonly destroyRef = inject(DestroyRef);
  private lastRegisteredElement: HTMLDivElement | null = null;

  constructor() {
    // Re-register the editor and restore its content every time the contentEditable
    // element is (re-)created by the @switch block in the template (mode round-trip).
    // Effects run after inputs are bound, so reading `this.htmlContent()` here is safe.
    effect(() => {
      const ref = this.editorRef();
      const element = ref?.nativeElement ?? null;
      if (!element || element === this.lastRegisteredElement) {
        return;
      }
      this.lastRegisteredElement = element;
      element.innerHTML = this.htmlContent();
      this.editor.registerEditor(element);
      this.editor.refreshState();
    });

    const onSelectionChange = (): void => {
      const element = this.editorRef()?.nativeElement;
      if (element && document.activeElement === element) {
        this.editor.refreshState();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('selectionchange', onSelectionChange);
    });
  }

  /**
   * Read `initialValue` / `config` *after* Angular has bound parent inputs.
   *
   * Signal inputs declared with `input()` are only guaranteed to hold their
   * parent-bound value starting from the first change-detection cycle —
   * calling them inside the constructor yields the declared default and
   * silently discards anything the consumer passed in. That is why the
   * initial-content load, the `storageKey` lookup, and the initial mode
   * selection all have to live in `ngOnInit`.
   */
  ngOnInit(): void {
    const cfg = mergeConfig(this.config());
    const initial = this.initialValue();
    const saved = cfg.storageKey ? this.loadDraft(cfg.storageKey) : null;
    const initialContent = initial !== '' ? initial : (saved ?? '');
    if (initialContent) {
      this.htmlContent.set(initialContent);
    }
    if (cfg.modes.length && cfg.modes[0] !== this.mode()) {
      this.mode.set(cfg.modes[0]);
    }
  }

  onEditorInput(): void {
    const element = this.editorRef()?.nativeElement;
    if (!element) {
      return;
    }
    this.htmlContent.set(element.innerHTML);
    this.editor.refreshState();
    this.contentChange.emit(element.innerHTML);
  }

  onEditorBlur(): void {
    const element = this.editorRef()?.nativeElement;
    if (!element) {
      return;
    }
    this.htmlContent.set(element.innerHTML);
  }

  onHtmlInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.htmlContent.set(target.value);
    this.contentChange.emit(target.value);
  }

  applyHtml(): void {
    // Switch back to WYSIWYG; the effect() above will restore innerHTML on the new element.
    this.lastRegisteredElement = null;
    this.mode.set('wysiwyg');
  }

  switchMode(mode: EditorViewMode): void {
    if (mode === this.mode()) {
      return;
    }
    if (this.mode() === 'wysiwyg') {
      const element = this.editorRef()?.nativeElement;
      if (element) {
        this.htmlContent.set(element.innerHTML);
      }
    }
    // Force the effect to re-init the next WYSIWYG element when it (re-)appears.
    this.lastRegisteredElement = null;
    this.mode.set(mode);
  }

  saveDraft(): void {
    if (this.mode() === 'wysiwyg') {
      // Only in WYSIWYG mode is the contentEditable element the source of truth.
      // In 'html' mode, onHtmlInput already keeps htmlContent() up to date; in
      // 'preview' mode, nothing can be edited. Reading from editorRef here in
      // any other mode would either clobber user edits with a stale snapshot
      // (from a detached node) or simply no-op.
      const element = this.editorRef()?.nativeElement;
      if (element) {
        this.htmlContent.set(element.innerHTML);
      }
    }
    const key = this.resolvedConfig().storageKey;
    const html = this.htmlContent();
    if (key) {
      try {
        localStorage.setItem(key, html);
      } catch (error) {
        console.error('Unable to save draft', error);
      }
    }
    this.savedAt.set(new Date());
    this.draftSaved.emit(html);
  }

  clearAll(): void {
    this.editor.reset();
    this.htmlContent.set('');
    const element = this.editorRef()?.nativeElement;
    if (element) {
      element.innerHTML = '';
    }
    const key = this.resolvedConfig().storageKey;
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Unable to clear draft', error);
      }
    }
    this.savedAt.set(null);
    this.contentChange.emit('');
  }

  copyHtml(): void {
    void navigator.clipboard.writeText(this.htmlContent());
  }

  /** Expose the raw sanitized HTML for programmatic access (e.g. form integrations). */
  getHtml(): string {
    return this.htmlContent();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      this.saveDraft();
      return;
    }
    // Google Docs-style block format shortcuts: Ctrl+Alt+0..4 pick paragraph
    // and H1..H4 respectively. We intentionally only bind them when the
    // contentEditable WYSIWYG view is active and focused, so raw HTML / preview
    // modes don't accidentally intercept the user's keys.
    if (this.mode() !== 'wysiwyg' || !event.altKey) {
      return;
    }
    const element = this.editorRef()?.nativeElement;
    if (!element || document.activeElement !== element) {
      return;
    }
    const mapping: Partial<Record<string, BlockFormat>> = {
      '0': 'p',
      '1': 'h1',
      '2': 'h2',
      '3': 'h3',
      '4': 'h4',
    };
    const target = mapping[event.key];
    if (target) {
      event.preventDefault();
      this.editor.setBlock(target);
    }
  }

  isModeEnabled(mode: EditorViewMode): boolean {
    return this.resolvedConfig().modes.includes(mode);
  }

  private loadDraft(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
