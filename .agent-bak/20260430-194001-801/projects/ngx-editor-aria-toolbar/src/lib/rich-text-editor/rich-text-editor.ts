import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  type OnInit,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { EditorToolbarComponent } from './components/editor-toolbar/editor-toolbar';
import { EditorCommandService } from './services/editor-command.service';
import {
  type DeepPartial,
  DEFAULT_I18N,
  type EditorViewMode,
  mergeConfig,
  mergeI18n,
  type RichTextEditorConfig,
  type RichTextEditorI18n,
} from './editor-config';

type EditorMode = 'wysiwyg' | 'html' | 'preview';
const STORAGE_KEY = 'rich-text-editor.draft';

@Component({
  selector: 'jhi-rich-text-editor',
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    EditorCommandService,
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
  imports: [CommonModule, EditorToolbarComponent],
})
export default class RichTextEditorComponent
  implements OnInit, AfterViewInit, ControlValueAccessor, OnDestroy
{
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

  protected readonly editorHost = viewChild<ElementRef<HTMLDivElement>>('editor');

  readonly editor = inject(EditorCommandService);
  readonly mode = signal<EditorViewMode>('wysiwyg');
  readonly htmlContent = signal<string>('');
  readonly wordCount = computed<number>(() => {
    this.editor.contentChanged();
    return this.editor.getWordCount();
  });
  readonly charCount = computed<number>(() => {
    this.editor.contentChanged();
    return this.editor.getTextLength();
  });
  readonly savedAt = signal<Date | null>(null);

  readonly resolvedConfig = computed(() => mergeConfig(this.config()));
  readonly labels = computed(() => mergeI18n(this.i18n()));
  private readonly destroyRef = inject(DestroyRef);
  private lastRegisteredElement: HTMLDivElement | null = null;
  private editorMounted = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  protected isDisabled = signal<boolean>(false);

  constructor() {
    // Keep `htmlContent` in sync with TipTap so `switchMode` can round-trip
    // HTML without pulling from the editor imperatively.
    effect(() => {
      this.editor.contentChanged();
      if (this.mode() === 'wysiwyg' && this.editorMounted) {
        const html = this.editor.getHTML();
        this.htmlContent.set(html);
        this.onChange(html);
      }
    });
  }
  ngOnDestroy(): void {
    this.editor.destroy();
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

  ngAfterViewInit(): void {
    const host = this.editorHost()?.nativeElement;
    if (!host || this.editorMounted) {
      return;
    }
    this.editor.init(host, this.htmlContent());
    this.editorMounted = true;
    this.htmlContent.set(this.editor.getHTML());
    this.editor.registerEditorElement(host);
  }

  switchMode(mode: EditorMode): void {
    const current = this.mode();
    if (current === mode) {
      return;
    }
    if (current === 'wysiwyg' && this.editorMounted) {
      this.htmlContent.set(this.editor.getHTML());
    }
    if (current === 'html' && mode !== 'html' && this.editorMounted) {
      this.editor.setContent(this.htmlContent());
    }
    this.mode.set(mode);
  }

  onHtmlInput(value: Event): void {
    const v = (value.target as HTMLInputElement).value;
    this.htmlContent.set(v);
    this.onChange(v);
  }

  applyHtml(): void {
    if (this.editorMounted) {
      this.editor.setContent(this.htmlContent());
      this.onChange(this.htmlContent());
    }
  }

  writeValue(value: string | null): void {
    const content = value ?? '';
    this.htmlContent.set(content);
    if (this.editorMounted && this.mode() === 'wysiwyg') {
      this.editor.setContent(content);
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    // Note: TipTap editor editable state can also be toggled here if needed
  }

  saveDraft(): void {
    const html =
      this.mode() === 'wysiwyg' && this.editorMounted ? this.editor.getHTML() : this.htmlContent();
    try {
      localStorage.setItem(STORAGE_KEY, html);
      this.htmlContent.set(html);
      this.savedAt.set(new Date());
    } catch {
      // localStorage can throw in private browsing / quota exceeded; silently
      // degrade so the click still feels responsive.
    }
  }

  copyHtml(): void {
    const html =
      this.mode() === 'wysiwyg' && this.editorMounted ? this.editor.getHTML() : this.htmlContent();
    void navigator.clipboard.writeText(html);
  }

  clearAll(): void {
    this.editor.setContent('<p></p>');
    this.htmlContent.set('<p></p>');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.savedAt.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('jhi-rich-text-editor')) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveDraft();
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
