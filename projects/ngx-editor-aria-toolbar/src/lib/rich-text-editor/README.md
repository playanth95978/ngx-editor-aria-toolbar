# `@rich-text-editor` — Angular 21 rich text editor (lib-ready)

Signals-first WYSIWYG + HTML + Preview editor built on the new
[`@angular/aria/toolbar`](https://angular.dev/guide/aria/toolbar) primitives
and a hand-rolled `Selection` / `Range` command engine with a custom
undo/redo stack. No `document.execCommand`. No third-party deps beyond the
Angular framework. Apple / Google Docs-style "fluid caret" behaviour: click a
format button with a collapsed caret and the focus stays in the editor so
the next keystroke applies the format immediately.

This folder is laid out as a **library-ready** module. It has a
[`public-api.ts`](./public-api.ts) barrel, no coupling to the surrounding
JHipster app, and no hard dependency on `@ngx-translate/core`. The
`/editor` route in the parent app is wired via a thin **demo host**
(`demo/editor-demo-page.ts`) that shows how a consumer pipes JHipster's
`TranslateService` into the component's `i18n` input. That file is also the
template to follow when extracting this folder into a standalone npm
package — it is the one place that understands the host app's i18n
infrastructure.

## Install & import

```ts
import { RichTextEditorComponent, type RichTextEditorConfig, type RichTextEditorI18n } from 'app/rich-text-editor/public-api';

@Component({
  imports: [RichTextEditorComponent],
  template: `
    <jhi-rich-text-editor
      [initialValue]="draft"
      [config]="config"
      [i18n]="labels"
      (contentChange)="onChange($event)"
      (draftSaved)="persist($event)"
    ></jhi-rich-text-editor>
  `,
})
export class MyHostComponent {
  draft = '<p>Hello <strong>world</strong>.</p>';

  config: RichTextEditorConfig = {
    modes: ['wysiwyg', 'preview'],
    showHeader: false,
    toolbar: { colors: false, insert: false },
  };

  labels: Partial<RichTextEditorI18n> = {
    actions: { save: 'Save my post' },
  };

  onChange(html: string) {
    /* … */
  }
  persist(html: string) {
    /* … */
  }
}
```

The component ships with English defaults, so the `i18n` input is fully
optional. The `config` input is optional too; omitting it renders the full
toolbar with all three modes, the default storage key, etc.

## Public API

| Export                                                          | Description                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RichTextEditorComponent`                                       | Main standalone component. Inputs: `initialValue`, `config`, `i18n`. Outputs: `contentChange`, `draftSaved`.                             |
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

## Roadmap / not in scope

- Publish as a standalone npm package with its own Angular workspace (`ng
generate library`). That requires `angular.json` changes that touch the
  JHipster build; intentionally deferred.
- Unit tests on the toolbar component.
- Optional Markdown mode.
- Plugin API for custom toolbar buttons.
