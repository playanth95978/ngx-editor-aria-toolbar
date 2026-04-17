/**
 * Public entry point for the rich text editor library.
 *
 * Host applications should import everything they need from this barrel so
 * that the internal file layout stays free to evolve without breaking
 * consumers. When the time comes to publish this as a standalone npm
 * package, this is the file that becomes `index.ts` at the package root.
 */

export { default as RichTextEditorComponent } from './rich-text-editor';
export { EditorToolbarComponent } from './components/editor-toolbar/editor-toolbar';
export { EditorCommandService } from './services/editor-command.service';
export type { BlockFormat, EditorState } from './services/editor-command.service';
export { DEFAULT_CONFIG, DEFAULT_I18N, mergeConfig, mergeI18n } from './editor-config';
export type { DeepPartial, EditorViewMode, RichTextEditorConfig, RichTextEditorI18n, ToolbarSections } from './editor-config';
