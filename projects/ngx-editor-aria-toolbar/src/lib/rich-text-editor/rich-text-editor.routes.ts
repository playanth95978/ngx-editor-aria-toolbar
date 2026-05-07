import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component'),
    title: 'Connexion',
  },
  {
    path: '',
    loadComponent: () => import('./demo/editor-demo-page'),
    title: 'richTextEditor.title',
  },
];

export default routes;
