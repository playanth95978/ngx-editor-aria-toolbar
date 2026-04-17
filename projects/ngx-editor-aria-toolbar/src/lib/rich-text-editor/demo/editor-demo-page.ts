import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import RichTextEditorComponent from '../rich-text-editor';
import { DeepPartial, RichTextEditorConfig, RichTextEditorI18n } from '../editor-config';

/**
 * Demo host for the `/editor` route.
 *
 * This component is *not* part of the library surface — it demonstrates how a
 * consumer application wires `RichTextEditorComponent` into its own i18n
 * infrastructure. The JHipster app uses @ngx-translate, so we pull the
 * existing `richTextEditor.*` translation keys via `TranslateService` and
 * reshape them into the library's `RichTextEditorI18n` contract.
 *
 * A host app that doesn't use @ngx-translate would pass a static object
 * instead (or omit `i18n` entirely to accept the English defaults). See
 * `rich-text-editor/README.md` for examples.
 */
@Component({
  selector: 'jhi-editor-demo-page',
  template: ` <jhi-rich-text-editor [i18n]="i18n()" [config]="config" (draftSaved)="onDraftSaved($event)"></jhi-rich-text-editor> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichTextEditorComponent],
})
export default class EditorDemoPageComponent {
  readonly config: RichTextEditorConfig = {};

  readonly translate = inject(TranslateService);

  readonly i18n = computed<DeepPartial<RichTextEditorI18n>>(() => {
    // Re-read translations on every language change. The `onLangChange`
    // observable of TranslateService is itself a signal-friendly source if
    // we ever need to react; for this demo we just compute lazily.
    void this.translate.getCurrentLang();
    const instant = <T>(key: string, fallback: T): string | T => {
      const value = this.translate.instant(key);
      return value && value !== key ? (value as string) : fallback;
    };
    return {
      title: instant('richTextEditor.title', undefined as unknown as string),
      subtitle: instant('richTextEditor.subtitle', undefined as unknown as string),
      modes: {
        wysiwyg: instant('richTextEditor.modes.wysiwyg', undefined as unknown as string),
        html: instant('richTextEditor.modes.html', undefined as unknown as string),
        preview: instant('richTextEditor.modes.preview', undefined as unknown as string),
      },
      toolbar: {
        blockFormatLabel: instant('richTextEditor.toolbar.blockFormatLabel', undefined as unknown as string),
        foreColor: instant('richTextEditor.toolbar.foreColor', undefined as unknown as string),
        backColor: instant('richTextEditor.toolbar.backColor', undefined as unknown as string),
        block: {
          paragraph: instant('richTextEditor.toolbar.block.paragraph', undefined as unknown as string),
          h1: instant('richTextEditor.toolbar.block.h1', undefined as unknown as string),
          h2: instant('richTextEditor.toolbar.block.h2', undefined as unknown as string),
          h3: instant('richTextEditor.toolbar.block.h3', undefined as unknown as string),
          h4: instant('richTextEditor.toolbar.block.h4', undefined as unknown as string),
          blockquote: instant('richTextEditor.toolbar.block.blockquote', undefined as unknown as string),
          pre: instant('richTextEditor.toolbar.block.pre', undefined as unknown as string),
        },
      },
      actions: {
        save: instant('richTextEditor.actions.save', undefined as unknown as string),
        copyHtml: instant('richTextEditor.actions.copyHtml', undefined as unknown as string),
        applyHtml: instant('richTextEditor.actions.applyHtml', undefined as unknown as string),
      },
      stats: {
        words: instant('richTextEditor.stats.words', undefined as unknown as string),
        characters: instant('richTextEditor.stats.characters', undefined as unknown as string),
        savedAt: instant('richTextEditor.stats.savedAt', undefined as unknown as string),
      },
    };
  });

  onDraftSaved(html: string): void {
    // Host-app specific hook (show a toast, POST to backend, etc.). For the
    // demo we just log so the binding path is observable.
    console.warn('[rich-text-editor] draft saved, length =', html.length);
  }
}
