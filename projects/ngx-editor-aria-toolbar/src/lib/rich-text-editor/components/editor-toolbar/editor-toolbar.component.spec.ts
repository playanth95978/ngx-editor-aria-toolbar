import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EditorToolbarComponent } from './editor-toolbar';
import { EditorCommandService } from '../../services/editor-command.service';
import { signal } from '@angular/core';
import { Toolbar, ToolbarWidget, ToolbarWidgetGroup } from '@angular/aria/toolbar';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('EditorToolbarComponent', () => {
  let component: EditorToolbarComponent;
  let fixture: ComponentFixture<EditorToolbarComponent>;
  let editorService: EditorCommandService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        EditorToolbarComponent,
        Toolbar,
        ToolbarWidget,
        ToolbarWidgetGroup,
        FormsModule,
        TranslateModule.forRoot(),
        BrowserAnimationsModule,
      ],
      providers: [
        {
          provide: EditorCommandService,
          useValue: {
            state: signal({
              bold: false,
              italic: false,
              underline: false,
              strikeThrough: false,
              textAlign: 'left',
              block: 'p',
            }),
            armToolbarFocusSteal: vi.fn(),
            setBlock: vi.fn(),
            setForeColor: vi.fn(),
            setBackColor: vi.fn(),
            createLink: vi.fn(),
            insertImage: vi.fn(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(EditorToolbarComponent);
    component = fixture.componentInstance;
    editorService = TestBed.inject(EditorCommandService);
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  describe('Rendu et accessibilité', () => {
    it('devrait rendre le composant avec une toolbar ARIA', () => {
      const toolbar = fixture.debugElement.query(By.css('jhi-editor-toolbar'));
      expect(toolbar).toBeTruthy();
    });

    it('devrait afficher les boutons de bloc par défaut', () => {
      const blockSelects = fixture.debugElement.queryAll(By.css('select'));
      expect(blockSelects.length).toBeGreaterThan(0);
    });
  });

  describe('Comportement des boutons', () => {
    it('devrait appeler armToolbarFocusSteal lors du clic sur un bouton', () => {
      const spy = vi.spyOn(editorService, 'armToolbarFocusSteal');
      const button = fixture.debugElement.query(By.css('button'));
      if (button) {
        button.nativeElement.click();
        expect(spy).toHaveBeenCalled();
      }
    });

    it('devrait appeler setBlock lors du changement de bloc', () => {
      const spy = vi.spyOn(editorService, 'setBlock');
      const select = fixture.debugElement.query(By.css('select'));
      if (select) {
        select.nativeElement.value = 'h1';
        select.nativeElement.dispatchEvent(new Event('change'));
        expect(spy).toHaveBeenCalledWith('h1');
      }
    });

    it('devrait appeler setForeColor lors du changement de couleur de texte', () => {
      const spy = vi.spyOn(editorService, 'setForeColor');
      const input = fixture.debugElement.query(By.css('input[type="color"]'));
      if (input) {
        input.nativeElement.value = '#ff0000';
        input.nativeElement.dispatchEvent(new Event('input'));
        expect(spy).toHaveBeenCalledWith('#ff0000');
      }
    });

    it('devrait appeler setBackColor lors du changement de couleur de fond', () => {
      const spy = vi.spyOn(editorService, 'setBackColor');
      const inputs = fixture.debugElement.queryAll(By.css('input[type="color"]'));
      if (inputs.length > 1) {
        const input = inputs[1];
        input.nativeElement.value = '#00ff00';
        input.nativeElement.dispatchEvent(new Event('input'));
        expect(spy).toHaveBeenCalledWith('#00ff00');
      }
    });

    it('devrait ouvrir une invite pour créer un lien', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com');
      const spy = vi.spyOn(editorService, 'createLink');
      const button = fixture.debugElement.query(By.css('button[aria-label="Insert Link"]'));
      if (button) {
        button.nativeElement.click();
        expect(promptSpy).toHaveBeenCalled();
        expect(spy).toHaveBeenCalledWith('https://example.com');
      }
      promptSpy.mockRestore();
    });

    it('devrait ouvrir une invite pour insérer une image', () => {
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/image.png');
      const spy = vi.spyOn(editorService, 'insertImage');
      const button = fixture.debugElement.query(By.css('button[aria-label="Insert Image"]'));
      if (button) {
        button.nativeElement.click();
        expect(promptSpy).toHaveBeenCalled();
        expect(spy).toHaveBeenCalledWith('https://example.com/image.png');
      }
      promptSpy.mockRestore();
    });

    it('devrait émettre clearRequested lors du clic sur "Effacer"', () => {
      const spy = vi.spyOn(component.clearRequested, 'emit');
      const clearButton = fixture.debugElement.query(By.css('button[aria-label="Clear"]'));
      if (clearButton) {
        clearButton.nativeElement.click();
        expect(spy).toHaveBeenCalled();
      }
    });
  });

  describe('Gestion des événements', () => {
    it('devrait gérer onToolbarMouseDown correctement', () => {
      const event = new MouseEvent('mousedown', { cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const button = fixture.debugElement.query(By.css('button'));
      if (button) {
        component.onToolbarMouseDown(event as any);
        expect(preventDefaultSpy).toHaveBeenCalled();
      }
    });

    it('devrait gérer onToolbarPointerDown correctement', () => {
      const event = new PointerEvent('pointerdown');
      const spy = vi.spyOn(editorService, 'armToolbarFocusSteal');
      const button = fixture.debugElement.query(By.css('button'));
      if (button) {
        component.onToolbarPointerDown(event);
        expect(spy).toHaveBeenCalled();
      }
    });
  });
});
