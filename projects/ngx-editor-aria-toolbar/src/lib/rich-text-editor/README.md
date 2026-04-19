# `@rich-text-editor` — Angular 21 rich text editor (lib-ready)

Signals-first WYSIWYG + HTML + Preview editor built on the new
[`@angular/aria/toolbar`](https://angular.dev/guide/aria/toolbar) primitives

This folder is laid out as a **library-ready** module. It has a
[`public-api.ts`](./public-api.ts) barrel, no coupling to the surrounding
JHipster app, and no hard dependency on `@ngx-translate/core`. The
`/editor` route in the parent app is wired via a thin **demo host**
(`demo/editor-demo-page.ts`) that shows how a consumer pipes JHipster's
`TranslateService` into the component's `i18n` input. That file is also the
template to follow when extracting this folder into a standalone npm
package — it is the one place that understands the host app's i18n
infrastructure.
## Why this library?

Tiptap + Angular Aria toolbar causes focus issues.

This library fixes that.

## Install & import

```ts
import { RichTextEditorComponent, type RichTextEditorConfig, type RichTextEditorI18n } from 'ngx-editor-aria-toolbar';

@Component({
  imports: [RichTextEditorComponent, FormsModule, ReactiveFormsModule],
  template: `
    <!-- Usage with ngModel -->
    <jhi-rich-text-editor [(ngModel)]="content"></jhi-rich-text-editor>

    <!-- Usage with Reactive Forms -->
    <form [formGroup]="form">
      <jhi-rich-text-editor formControlName="body"></jhi-rich-text-editor>
    </form>
  `,
})
export class MyHostComponent {
  content = '<p>Hello world</p>';
  form = new FormGroup({
    body: new FormControl('Initial content')
  });
}
```

The component implements `ControlValueAccessor`, making it fully compatible with Angular Forms (`ngModel`, `formControl`, `formControlName`).

## Public API

| Export                                                          | Description                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RichTextEditorComponent`                                       | Main standalone component. Implements `ControlValueAccessor`. Inputs: `initialValue`, `config`, `i18n`. Outputs: `contentChange`, `draftSaved`. |
| `EditorToolbarComponent`                                        | Standalone toolbar. Usable on its own if you want to render the editor surface yourself — wire it to an `EditorCommandService` instance. |
| `EditorCommandService`                                          | The command engine. Inject in a host and call `registerEditor(divEl)`, then `toggleBold()` / `setBlock('h1')` / `unorderedList()` / …    |
| `BlockFormat`, `EditorState`                                    | Types exposed by the service.                                                                                                            |
| `RichTextEditorConfig`, `RichTextEditorI18n`, `ToolbarSections` | Configuration types.                                                                                                                     |
| `DEFAULT_CONFIG`, `DEFAULT_I18N`, `mergeConfig`, `mergeI18n`    | Defaults + deep-merge helpers for consumers that want to compose partial overrides.                                                      |

## `RichTextEditorConfig`

```ts
interface RichTextEditorConfig {
  modes?: ('wysiwyg' | 'html' | 'preview')[]; // subset + initial mode
  showHeader?: boolean; // hide title + subtitle
  showFooter?: boolean; // hide counters + action row
  showSaveButton?: boolean;
  showCopyButton?: boolean;
  storageKey?: string | null; // null disables auto-load
  toolbar?: ToolbarSections; // per-group visibility
}

interface ToolbarSections {
  history?: boolean;
  blockFormat?: boolean;
  inline?: boolean;
  alignment?: boolean;
  lists?: boolean;
  colors?: boolean;
  insert?: boolean;
  utilities?: boolean;
}
```

All fields are optional; `mergeConfig()` fills in
[`DEFAULT_CONFIG`](./editor-config.ts) for anything you skip.

### Example: Minimalist Configuration

You can restrict the editor to a "Lite" mode by disabling specific toolbar sections and modes:

```ts
const liteConfig: RichTextEditorConfig = {
  modes: ['wysiwyg', 'preview'], // No HTML source mode
  showFooter: false,             // No word counters or action buttons
  toolbar: {
    history: false,              // No undo/redo
    colors: false,               // No text/highlight colors
    insert: false,               // No links/images
    utilities: false             // No clear format/fullscreen
  }
};
```

Usage in template:
```html
<jhi-rich-text-editor [config]="liteConfig" [(ngModel)]="content"></jhi-rich-text-editor>
```

## `RichTextEditorI18n`

Every user-visible string passes through this object. You can supply a
partial (any subtree) and the component will deep-merge it with
[`DEFAULT_I18N`](./editor-config.ts):

```ts
<jhi-rich-text-editor
  [i18n]="{ actions: { save: 'Publish' }, modes: { preview: 'Voir' } }"
></jhi-rich-text-editor>
```

## Theming

All colours and spacings come from the component's own `rich-text-editor.scss`
/ `editor-toolbar.scss`. There are no Bootstrap or JHipster class hooks —
consumers style the component via ordinary CSS cascade (the selectors are
`.rich-text-editor`, `.editor-toolbar`, `.rte-*`, `.tb-*`).

## Focus Management (Angular Aria Toolbar Hack)

When using `@angular/aria/toolbar` with a `contenteditable` surface (like TipTap), clicking a toolbar button normally causes the editor to lose focus *before* the command is executed. This collapses the text selection, preventing formatting from being applied.

To solve this, this library implements a two-part coordination hack:

1.  **Mousedown Prevention**: In `EditorToolbarComponent`, we `preventDefault()` on `mousedown` for all buttons. This stops the browser from transferring focus away from the editor.
    ```ts
    onToolbarMouseDown(event: MouseEvent): void {
      if ((event.target as HTMLElement).closest('button')) {
        event.preventDefault();
      }
    }
    ```

2.  **Focus Restoration Guard**: Since `Angular Aria`'s internal logic still calls `.focus()` programmatically on the clicked widget, we use a guard in `EditorCommandService`. We "arm" the guard on `pointerdown`, and if a `focusout` occurs towards the toolbar, we bounce the focus back to the editor in the next microtask (`setTimeout(0)`), restoring the previous selection.
    ```ts
    // In EditorToolbarComponent
    onToolbarPointerDown() {
      this.editor.armToolbarFocusSteal();
    }

    // In EditorCommandService
    this.editorElement.addEventListener('focusout', (event) => {
      if (!this.expectingToolbarSteal) return;
      if (event.relatedTarget?.closest('[ngToolbar]')) {
        const savedRange = window.getSelection()?.getRangeAt(0).cloneRange();
        setTimeout(() => {
          this.editorElement.focus();
          // Restore range...
        }, 0);
      }
    });
    ```

## Roadmap / not in scope

- Publish as a standalone npm package with its own Angular workspace (`ng
generate library`). That requires `angular.json` changes that touch the
  JHipster build; intentionally deferred.
- Unit tests on the toolbar component.
- Optional Markdown mode.
- Plugin API for custom toolbar buttons.
