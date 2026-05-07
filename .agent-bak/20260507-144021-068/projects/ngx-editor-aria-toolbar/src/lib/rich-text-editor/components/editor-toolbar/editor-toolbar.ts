import { ChangeDetectionStrategy, Component, computed, inject, input, output, ViewEncapsulation } from '@angular/core';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';
import { FormsModule } from '@angular/forms';

import { BlockFormat, EditorCommandService } from '../../services/editor-command.service';
import { type DeepPartial, DEFAULT_CONFIG, DEFAULT_I18N, mergeI18n, RichTextEditorI18n, ToolbarSections } from '../../editor-config';

@Component({
  selector: 'jhi-editor-toolbar',
  templateUrl: './editor-toolbar.html',
  styleUrl: './editor-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [Toolbar, ToolbarWidget, ToolbarWidgetGroup, FormsModule, Toolbar, ToolbarWidget],
})
export class EditorToolbarComponent {
  readonly clearRequested = output();

  /** Which sections of the toolbar to render. Defaults to everything on. */
  readonly sections = input<ToolbarSections>(DEFAULT_CONFIG.toolbar);

  /** Labels and prompts. Consumers pass a partial; defaults fill the rest. */
  readonly i18n = input<DeepPartial<RichTextEditorI18n>>(DEFAULT_I18N);

  readonly editor = inject(EditorCommandService);
  readonly state = this.editor.state;

  readonly labels = computed(() => mergeI18n(this.i18n()));

  readonly visible = computed<Required<ToolbarSections>>(() => ({
    ...DEFAULT_CONFIG.toolbar,
    ...this.sections(),
  }));

  readonly blocks = computed<{ value: BlockFormat; label: string }[]>(() => {
    const t = this.labels().toolbar.block;
    return [
      { value: 'p', label: t.paragraph },
      { value: 'h1', label: t.h1 },
      { value: 'h2', label: t.h2 },
      { value: 'h3', label: t.h3 },
      { value: 'h4', label: t.h4 },
      { value: 'blockquote', label: t.blockquote },
      { value: 'pre', label: t.pre },
    ];
  });

  readonly zoomLevels = computed(() => {
    const t = this.labels().toolbar;
    return [
      { value: 50, label: '50%' },
      { value: 75, label: '75%' },
      { value: 100, label: '100%' },
      { value: 125, label: '125%' },
      { value: 150, label: '150%' },
      { value: 200, value: '200%' },
    ];
  });

  /**
   * Preserve the contentEditable selection when a toolbar button is clicked.
   *
   * Without this, mousedown on a `<button>` transfers focus out of the editor
   * BEFORE the `(click)` handler runs, which collapses the live selection and
   * prevents commands like `toggleBold()` from seeing the user's selection.
   * We only preventDefault for buttons so that the native `<select>` and the
   * `<input type="color">` widgets keep working (they need the default focus
   * behaviour to open their pickers).
   */
  onToolbarMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      event.preventDefault();
    }
  }

  /**
   * Arm the focus-steal reversal guard in the service.
   *
   * `preventDefault` on mousedown (above) blocks the browser's default focus
   * transfer, but Angular Aria's `ToolbarPattern.onClick` still runs
   * synchronously during the click bubble and calls `.focus()` on the
   * clicked widget (see `_list-navigation-chunk.mjs` line 49). That
   * programmatic focus cannot be blocked here. Instead, we tell the service
   * to expect a focus-steal so its editor `focusout` handler can bounce
   * focus back via `setTimeout(0)`. We gate on `<button>` only so the
   * native `<select>` / `<input type="color">` widgets keep their own
   * focus semantics.
   */
  onToolbarPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      this.editor.armToolbarFocusSteal();
    }
  }

  onBlockChange(block: BlockFormat): void {
    this.editor.setBlock(block);
  }

  onForeColorChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.editor.setForeColor(target.value);
  }

  onBackColorChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.editor.setBackColor(target.value);
  }

  onCreateLink(): void {
    const url = window.prompt(this.labels().prompts.linkUrl);
    if (url) {
      this.editor.createLink(url);
    }
  }

  onInsertImage(): void {
    const url = window.prompt(this.labels().prompts.imageUrl);
    if (url) {
      this.editor.insertImage(url);
    }
  }

  onClearAll(): void {
    this.clearRequested.emit();
  }

  onZoomChange(zoom: number): void {
    this.editor.state.update(s => ({ ...s, zoom }));
  }

  onIncreaseZoom(): void {
    this.editor.increaseZoom();
  }

  onDecreaseZoom(): void {
    this.editor.decreaseZoom();
  }

  onResetZoom(): void {
    this.editor.resetZoom();
  }
}
