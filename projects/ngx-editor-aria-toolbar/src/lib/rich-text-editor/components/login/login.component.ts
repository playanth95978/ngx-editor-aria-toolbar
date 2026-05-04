import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'jhi-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
})
export default class LoginComponent {
  username = '';
  password = '';

  onSubmit(): void {
    console.log('Login submitted', { username: this.username, password: this.password });
    // Logique de login à implémenter ici (ex: appel à un service d'authentification)
  }
}
