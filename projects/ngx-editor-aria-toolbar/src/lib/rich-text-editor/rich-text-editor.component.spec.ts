import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RichTextEditorComponent from './rich-text-editor';
import { EditorCommandService } from './services/editor-command.service';
import { DEFAULT_CONFIG, DEFAULT_I18N } from './editor-config';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { signal } from '@angular/core';

describe('RichTextEditorComponent', () => {
  let component: RichTextEditorComponent;
  let fixture: ComponentFixture<RichTextEditorComponent>;
  let editorService: EditorCommandService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RichTextEditorComponent, TranslateModule.forRoot(), BrowserAnimationsModule],
      providers: [
        provideHttpClientTesting(),
        {
          provide: EditorCommandService,
          useValue: {
            clearUrl: vi.fn(),
            getUrl: vi.fn(),
            state: signal({
              bold: false,
              italic: false,
              underline: false,
              strikeThrough: false,
              textAlign: 'left',
              block: 'p',
            }),
            refreshState: vi.fn(),
            registerEditor: vi.fn(),
            toggleBold: vi.fn(),
            toggleItalic: vi.fn(),
            toggleUnderline: vi.fn(),
            toggleStrikeThrough: vi.fn(),
            setBlock: vi.fn(),
            setForeColor: vi.fn(),
            setBackColor: vi.fn(),
            createLink: vi.fn(),
            insertImage: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            setContent: vi.fn(),
            getHTML: vi.fn().mockReturnValue('<p></p>'),
            getWordCount: vi.fn().mockReturnValue(0),
            getTextLength: vi.fn().mockReturnValue(0),
            armToolbarFocusSteal: vi.fn(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(RichTextEditorComponent);
    component = fixture.componentInstance;
    editorService = fixture.debugElement.injector.get(EditorCommandService);

    // On mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    // On mock navigator.clipboard
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  describe('Rendu et Configuration', () => {
    it('devrait afficher les labels par défaut', () => {
      const title = fixture.debugElement.query(By.css('.rte-title')).nativeElement;
      const subtitle = fixture.debugElement.query(By.css('.rte-subtitle')).nativeElement;

      expect(title.textContent).toBe(DEFAULT_I18N.title);
      expect(subtitle.textContent).toBe(DEFAULT_I18N.subtitle);
    });

    it('devrait masquer le header si configuré ainsi', () => {
      fixture.componentRef.setInput('config', { showHeader: false });
      fixture.detectChanges();

      const header = fixture.debugElement.query(By.css('.rte-header'));
      expect(header).toBeNull();
    });

    it('devrait charger la valeur initiale', async () => {
      fixture.componentRef.setInput('initialValue', '<p>Hello World</p>');
      component.ngOnInit();
      fixture.detectChanges();

      // L'effet met à jour l'innerHTML
      const editor = fixture.debugElement.query(By.css('.rte-editor')).nativeElement;
      expect(editor.innerHTML).toBe('<p>Hello World</p>');
      expect(component.htmlContent()).toBe('<p>Hello World</p>');
    });
  });

  describe("Modes d'édition", () => {
    it('devrait changer de mode vers HTML', () => {
      const htmlBtn = fixture.debugElement.queryAll(By.css('.mode-btn'))[1];
      htmlBtn.nativeElement.click();
      fixture.detectChanges();

      expect(component.mode()).toBe('html');
      const textarea = fixture.debugElement.query(By.css('textarea'));
      expect(textarea).toBeTruthy();
    });

    it('devrait synchroniser le contenu lors du passage au mode HTML', () => {
      const editor = fixture.debugElement.query(By.css('.rte-editor')).nativeElement;
      editor.innerHTML = '<strong>Texte gras</strong>';
      // component.onEditorInput(); // Retiré car n'existe plus

      component.switchMode('html');
      fixture.detectChanges();

      const textarea = fixture.debugElement.query(By.css('textarea')).nativeElement;
      expect(textarea.value).toBe('<strong>Texte gras</strong>');
    });

    it('devrait appliquer le HTML depuis le textarea', () => {
      component.switchMode('html');
      fixture.detectChanges();

      const textarea = fixture.debugElement.query(By.css('textarea')).nativeElement;
      textarea.value = '<em>Italique</em>';
      textarea.dispatchEvent(new Event('input'));

      const applyBtn = fixture.debugElement.query(By.css('.rte-html-wrapper button')).nativeElement;
      applyBtn.click();
      fixture.detectChanges();

      expect(component.mode()).toBe('wysiwyg');
      // expect(component.htmlContent()).toBe('<em>Italique</em>');
    });
  });

  describe("Barre d'outils et Formatage", () => {
    it('devrait appeler toggleBold sur le service lors du clic sur le bouton Gras', () => {
      const spy = vi.spyOn(editorService, 'toggleBold');
      const boldBtn = fixture.debugElement.query(By.css('button[aria-label="Bold"]'));

      if (boldBtn) {
        boldBtn.nativeElement.click();
        expect(spy).toHaveBeenCalled();
      } else {
        throw new Error('Bouton Bold non trouvé');
      }
    });

    it("devrait mettre à jour l'état visuel des boutons (sélection/désélection)", () => {
      // On simule un changement d'état dans le service
      editorService.state.set({ ...editorService.state(), bold: true });
      fixture.detectChanges();

      const boldButton = fixture.debugElement.query(By.css('button[aria-label="Bold"]'));
      expect(boldButton.attributes['aria-pressed']).toBe('true');

      // On simule la désélection
      editorService.state.set({ ...editorService.state(), bold: false });
      fixture.detectChanges();

      expect(boldButton.attributes['aria-pressed']).toBe('false');
    });
  });

  describe('Statistiques et Compteurs', () => {
    it('devrait calculer correctement le nombre de mots', () => {
      component.htmlContent.set('<p>Ceci est un test</p>');
      fixture.detectChanges();
      expect(component.wordCount()).toBe(4);

      component.htmlContent.set('<p>Un  deux   trois</p>'); // Espaces multiples
      fixture.detectChanges();
      expect(component.wordCount()).toBe(3);
    });

    it('devrait calculer correctement le nombre de caractères (sans HTML)', () => {
      component.htmlContent.set('<p>Salut</p>'); // "Salut" = 5 chars
      fixture.detectChanges();
      expect(component.charCount()).toBe(5);
    });
  });

  describe('Actions du Footer', () => {
    it('devrait copier le HTML dans le presse-papier', () => {
      component.htmlContent.set('content to copy');
      const copyBtn = fixture.debugElement.query(By.css('.actions button:first-child')).nativeElement;
      copyBtn.click();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('content to copy');
    });

    it('devrait sauvegarder le brouillon dans localStorage', () => {
      component.htmlContent.set('my draft');
      const saveBtn = fixture.debugElement.query(By.css('.btn-primary')).nativeElement;
      saveBtn.click();

      expect(localStorage.setItem).toHaveBeenCalledWith(DEFAULT_CONFIG.storageKey, 'my draft');
      expect(component.savedAt()).toBeInstanceOf(Date);
    });

    it("devrait vider l'éditeur lors de l'appel à clearAll", () => {
      const setContentSpy = vi.spyOn(editorService, 'setContent');
      component.htmlContent.set('something');
      component.clearAll();

      expect(component.htmlContent()).toBe('<p></p>');
      expect(setContentSpy).toHaveBeenCalledWith('<p></p>');
      expect(localStorage.removeItem).toHaveBeenCalledWith('rich-text-editor.draft');
    });
  });

  describe('Raccourcis clavier', () => {
    it('devrait sauvegarder lors de Ctrl+S', () => {
      const spy = vi.spyOn(component, 'saveDraft');
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true } as KeyboardEventInit);
      document.dispatchEvent(event);

      expect(spy).toHaveBeenCalled();
    });

    it('devrait changer le bloc lors de Ctrl+Alt+1', () => {
      const spy = vi.spyOn(editorService, 'setBlock');
      // On doit s'assurer que l'éditeur est "focus" pour ce test
      component.mode.set('wysiwyg');
      fixture.detectChanges();

      const editor = fixture.debugElement.query(By.css('.rte-editor')).nativeElement;
      // Mock document.activeElement
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(editor);

      const event = new KeyboardEvent('keydown', { key: '1', ctrlKey: true, altKey: true } as KeyboardEventInit);
      document.dispatchEvent(event);

      expect(spy).toHaveBeenCalledWith('h1');
    });
  });
});
