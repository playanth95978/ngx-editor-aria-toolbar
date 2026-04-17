/**
 * Public entry point for the rich text editor library.
 *
 * Host applications should import everything they need from this barrel so
 * that the internal file layout stays free to evolve without breaking
 * consumers. When the time comes to publish this as a standalone npm
 * package, this is the file that becomes `index.ts` at the package root.
 */

export { default as RichTextEditorComponent } from './lib/rich-text-editor/rich-text-editor';
export { EditorToolbarComponent } from './lib/rich-text-editor/components/editor-toolbar/editor-toolbar';
export { EditorCommandService } from './lib/rich-text-editor/services/editor-command.service';
export type { BlockFormat, EditorState } from './lib/rich-text-editor/services/editor-command.service';
export { DEFAULT_CONFIG, DEFAULT_I18N, mergeConfig, mergeI18n } from './lib/rich-text-editor/editor-config';
export type {
  DeepPartial,
  EditorViewMode,
  RichTextEditorConfig,
  RichTextEditorI18n,
  ToolbarSections,
} from './lib/rich-text-editor/editor-config';
