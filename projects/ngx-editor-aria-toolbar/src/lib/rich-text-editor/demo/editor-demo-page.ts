import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

import RichTextEditorComponent from '../rich-text-editor';
import { DeepPartial, RichTextEditorConfig, RichTextEditorI18n } from '../editor-config';

/**
 * Demo host for the `/editor` route.
 */
@Component({
  selector: 'jhi-editor-demo-page',
  template: `
    <div style="padding: 2rem; max-width: 1000px; margin: 0 auto;">
      <h2>Demo: Rich Text Editor</h2>

      <div style="display: grid; grid-template-columns: 1fr; gap: 2rem;">

        <!-- Section NgModel -->
        <section style="border: 1px solid #ddd; padding: 1.5rem; border-radius: 8px;">
          <h3>1. Usage with <code>[(ngModel)]</code></h3>
          <p>This editor is bound to a simple string signal <code>ngModelValue</code>.</p>

          <jhi-rich-text-editor
            [i18n]="i18n()"
            [config]="config"
            [(ngModel)]="ngModelValue"
            (draftSaved)="onDraftSaved('ngModel', $event)">
          </jhi-rich-text-editor>

          <div style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
            <strong>Current ngModel value:</strong>
            <pre style="white-space: pre-wrap; font-size: 0.8rem; margin-top: 0.5rem; border-left: 3px solid #007bff; padding-left: 10px;">{{ ngModelValue }}</pre>
          </div>
        </section>

        <!-- Section Reactive Forms -->
        <section style="border: 1px solid #ddd; padding: 1.5rem; border-radius: 8px;">
          <h3>2. Usage with Reactive Forms</h3>
          <p>This editor is part of a <code>FormGroup</code> using <code>formControlName="content"</code>.</p>

          <form [formGroup]="demoForm">
            <jhi-rich-text-editor
              [i18n]="i18n()"
              [config]="config"
              formControlName="content"
              (draftSaved)="onDraftSaved('reactive', $event)">
            </jhi-rich-text-editor>
          </form>

          <div style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
            <strong>Form value (JSON):</strong>
            <pre style="white-space: pre-wrap; font-size: 0.8rem; margin-top: 0.5rem; border-left: 3px solid #28a745; padding-left: 10px;">{{ demoForm.value | json }}</pre>
            <div style="margin-top: 0.5rem;">
               <button (click)="resetForm()">Reset Form</button>
               <button (click)="setFormValue()">Set Random Content</button>
               <button (click)="toggleDisabled()">Toggle Disabled</button>
            </div>
          </div>
        </section>

        <!-- Section Custom Config -->
        <section style="border: 1px solid #ddd; padding: 1.5rem; border-radius: 8px;">
          <h3>3. Custom Configuration (Minimalist)</h3>
          <p>This editor uses a custom config: restricted modes, no footer, and limited toolbar sections.</p>

          <jhi-rich-text-editor
            [i18n]="i18n()"
            [config]="minimalConfig"
            [(ngModel)]="minimalModeValue">
          </jhi-rich-text-editor>

          <div style="margin-top: 1rem;">
            <strong>Configuration applied:</strong>
            <pre style="background: #eee; padding: 10px; border-radius: 4px; font-size: 0.8rem;">{{ minimalConfig | json }}</pre>
          </div>
        </section>

      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RichTextEditorComponent],
})
export default class EditorDemoPageComponent {
  readonly config: RichTextEditorConfig = {
    storageKey: 'demo-editor-content'
  };

  readonly minimalConfig: RichTextEditorConfig = {
    modes: ['wysiwyg', 'preview'],
    showFooter: false,
    toolbar: {
      history: false,
      colors: false,
      insert: false,
      utilities: false
    }
  };

  readonly translate = inject(TranslateService);

  // For ngModel demo
  ngModelValue = '<p>Hello from <strong>ngModel</strong>!</p>';

  minimalModeValue = '<p>Minimalist editor content.</p>';

  // For Reactive Forms demo
  readonly demoForm = new FormGroup({
    content: new FormControl('<p>Hello from <strong>Reactive Forms</strong>!</p>')
  });

  readonly i18n = computed<DeepPartial<RichTextEditorI18n>>(() => {
    // Re-read translations on every language change.
    void this.translate.getCurrentLang();
    const instant = <T>(key: string, fallback: T): string | T => {
      const value = this.translate.instant(key);
      return value && value !== key ? (value as string) : fallback;
    };
    return {
      title: instant('richTextEditor.title', 'Rich Text Editor'),
      subtitle: instant('richTextEditor.subtitle', 'A full-featured WYSIWYG editor built with TipTap and Angular Aria.'),
      modes: {
        wysiwyg: instant('richTextEditor.modes.wysiwyg', 'Visual'),
        html: instant('richTextEditor.modes.html', 'HTML Source'),
        preview: instant('richTextEditor.modes.preview', 'Preview'),
      },
      toolbar: {
        blockFormatLabel: instant('richTextEditor.toolbar.blockFormatLabel', 'Text Style'),
        foreColor: instant('richTextEditor.toolbar.foreColor', 'Text Color'),
        backColor: instant('richTextEditor.toolbar.backColor', 'Highlight Color'),
        block: {
          paragraph: instant('richTextEditor.toolbar.block.paragraph', 'Paragraph'),
          h1: instant('richTextEditor.toolbar.block.h1', 'Heading 1'),
          h2: instant('richTextEditor.toolbar.block.h2', 'Heading 2'),
          h3: instant('richTextEditor.toolbar.block.h3', 'Heading 3'),
          h4: instant('richTextEditor.toolbar.block.h4', 'Heading 4'),
          blockquote: instant('richTextEditor.toolbar.block.blockquote', 'Quote'),
          pre: instant('richTextEditor.toolbar.block.pre', 'Code Block'),
        },
      },
      actions: {
        save: instant('richTextEditor.actions.save', 'Save Draft'),
        copyHtml: instant('richTextEditor.actions.copyHtml', 'Copy HTML'),
        applyHtml: instant('richTextEditor.actions.applyHtml', 'Apply Changes'),
      },
      stats: {
        words: instant('richTextEditor.stats.words', 'words'),
        characters: instant('richTextEditor.stats.characters', 'characters'),
        savedAt: instant('richTextEditor.stats.savedAt', 'Last saved at'),
      },
    };
  });

  onDraftSaved(type: string, html: string): void {
    console.warn(`[rich-text-editor] [${type}] draft saved, length =`, html.length);
  }

  resetForm(): void {
    this.demoForm.reset({ content: '' });
  }

  setFormValue(): void {
    this.demoForm.patchValue({
      content: `<p>Updated at ${new Date().toLocaleTimeString()}!</p><p>This shows <strong>programmatic</strong> updates.</p>`
    });
  }

  toggleDisabled(): void {
    const control = this.demoForm.get('content');
    if (control) {
      control.disabled ? control.enable() : control.disable();
    }
  }
}
