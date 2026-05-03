/**
 * Public configuration surface for the rich text editor library.
 *
 * This module is designed to be consumed as if the editor were an external
 * npm package: host applications import {@link RichTextEditorConfig} and
 * {@link RichTextEditorI18n}, instantiate partial objects, and pass them to
 * `<jhi-rich-text-editor>` via the `config` and `i18n` inputs. The component
 * deep-merges the partial objects with {@link DEFAULT_I18N} and
 * {@link DEFAULT_CONFIG} so consumers only override what they care about.
 *
 * No runtime behaviour lives here; only types and defaults. Keep it that way
 * so this file stays safe to import from anywhere (including the public
 * `public-api.ts` barrel) without pulling in Angular decorators or DOM code.
 */

export type EditorViewMode = 'wysiwyg' | 'html' | 'preview';

/**
 * Which toolbar sections are rendered. Each flag toggles the entire group
 * (and its separator) via `@if` in the template. Default: every section on.
 */
export interface ToolbarSections {
  history?: boolean;
  blockFormat?: boolean;
  inline?: boolean;
  alignment?: boolean;
  lists?: boolean;
  colors?: boolean;
  insert?: boolean;
  utilities?: boolean;
  zoom?: boolean;
}

export interface RichTextEditorConfig {
  /**
   * Subset of view modes exposed in the top-right tab group. The first entry
   * is the initial mode. Defaults to all three modes starting on `wysiwyg`.
   */
  modes?: EditorViewMode[];

  /** Render the component's title / subtitle header. Default: true. */
  showHeader?: boolean;

  /** Render the footer with word / char counters and action buttons. Default: true. */
  showFooter?: boolean;

  /** Expose the "Save draft" button. Default: true. */
  showSaveButton?: boolean;

  /** Expose the "Copy HTML" button. Default: true. */
  showCopyButton?: boolean;

  /**
   * localStorage key used to persist drafts. Pass `null` to disable the
   * auto-load-on-init behaviour (the Save button will still fire
   * `(draftSaved)` but won't write anything). Default: `rich-text-editor.draft`.
   */
  storageKey?: string | null;

  /** Toolbar section visibility. */
  toolbar?: ToolbarSections;
}

export interface RichTextEditorI18n {
  title: string;
  subtitle: string;
  modes: {
    wysiwyg: string;
    html: string;
    preview: string;
  };
  toolbar: {
    blockFormatLabel: string;
    foreColor: string;
    backColor: string;
    block: {
      paragraph: string;
      h1: string;
      h2: string;
      h3: string;
      h4: string;
      blockquote: string;
      pre: string;
    };
  };
  prompts: {
    linkUrl: string;
    imageUrl: string;
  };
  actions: {
    save: string;
    copyHtml: string;
    applyHtml: string;
  };
  stats: {
    words: string;
    characters: string;
    savedAt: string;
  };
}

export const DEFAULT_I18N: RichTextEditorI18n = {
  title: 'Rich Text Editor',
  subtitle: 'Powered by Angular 21 signals, control flow and the @angular/aria toolbar primitives.',
  modes: {
    wysiwyg: 'Edit',
    html: 'HTML',
    preview: 'Preview',
  },
  toolbar: {
    blockFormatLabel: 'Block format',
    foreColor: 'Text color',
    backColor: 'Highlight color',
    block: {
      paragraph: 'Paragraph',
      h1: 'Heading 1',
      h2: 'Heading 2',
      h3: 'Heading 3',
      h4: 'Heading 4',
      blockquote: 'Blockquote',
      pre: 'Code block',
    },
  },
  prompts: {
    linkUrl: 'URL',
    imageUrl: 'Image URL',
  },
  actions: {
    save: 'Save draft',
    copyHtml: 'Copy HTML',
    applyHtml: 'Apply HTML',
  },
  stats: {
    words: ' words',
    characters: ' characters',
    savedAt: 'Saved at',
  },
};

export const DEFAULT_CONFIG: Required<Omit<RichTextEditorConfig, 'toolbar' | 'storageKey'>> & {
  toolbar: Required<ToolbarSections>;
  storageKey: string | null;
} = {
  modes: ['wysiwyg', 'html', 'preview'],
  showHeader: true,
  showFooter: true,
  showSaveButton: true,
  showCopyButton: true,
  storageKey: 'rich-text-editor.draft',
  toolbar: {
    history: true,
    blockFormat: true,
    inline: true,
    alignment: true,
    lists: true,
    colors: true,
    insert: true,
    utilities: true,
    zoom: true,
  },
};

/**
 * Recursive `Partial<T>` that matches the shape of the `i18n` input without
 * forcing consumers to specify every nested key.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Filter out keys whose value is literally `undefined` so that a spread
 * like `{ ...DEFAULT, ...override }` does not replace a populated default
 * with `undefined`. This matters because the `DeepPartial` contract allows
 * consumers (e.g. the demo reading from `TranslateService`) to emit
 * `undefined` for translation keys that don't exist in the current locale.
 */
function stripUndefined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) {
    return {};
  }
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function mergeI18n(override: DeepPartial<RichTextEditorI18n> | undefined): RichTextEditorI18n {
  if (!override) {
    return DEFAULT_I18N;
  }
  return {
    title: override.title ?? DEFAULT_I18N.title,
    subtitle: override.subtitle ?? DEFAULT_I18N.subtitle,
    modes: { ...DEFAULT_I18N.modes, ...stripUndefined(override.modes) },
    toolbar: {
      blockFormatLabel: override.toolbar?.blockFormatLabel ?? DEFAULT_I18N.toolbar.blockFormatLabel,
      foreColor: override.toolbar?.foreColor ?? DEFAULT_I18N.toolbar.foreColor,
      backColor: override.toolbar?.backColor ?? DEFAULT_I18N.toolbar.backColor,
      block: { ...DEFAULT_I18N.toolbar.block, ...stripUndefined(override.toolbar?.block) },
    },
    prompts: { ...DEFAULT_I18N.prompts, ...stripUndefined(override.prompts) },
    actions: { ...DEFAULT_I18N.actions, ...stripUndefined(override.actions) },
    stats: { ...DEFAULT_I18N.stats, ...stripUndefined(override.stats) },
  };
}

export function mergeConfig(override: RichTextEditorConfig | undefined): typeof DEFAULT_CONFIG {
  if (!override) {
    return DEFAULT_CONFIG;
  }
  return {
    modes: override.modes?.length ? override.modes : DEFAULT_CONFIG.modes,
    showHeader: override.showHeader ?? DEFAULT_CONFIG.showHeader,
    showFooter: override.showFooter ?? DEFAULT_CONFIG.showFooter,
    showSaveButton: override.showSaveButton ?? DEFAULT_CONFIG.showSaveButton,
    showCopyButton: override.showCopyButton ?? DEFAULT_CONFIG.showCopyButton,
    storageKey: override.storageKey === undefined ? DEFAULT_CONFIG.storageKey : override.storageKey,
    toolbar: { ...DEFAULT_CONFIG.toolbar, ...override.toolbar },
  };
}
