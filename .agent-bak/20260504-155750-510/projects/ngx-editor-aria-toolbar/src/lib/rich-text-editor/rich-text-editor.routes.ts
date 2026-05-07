import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./demo/editor-demo-page'),
    title: 'richTextEditor.title',
  },
];

export default routes;
