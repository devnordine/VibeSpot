import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  
  readonly form = new FormGroup({
    name: new FormControl('', { 
      nonNullable: true, 
      validators: [Validators.required, Validators.minLength(2)] 
    }),
    email: new FormControl('', { 
      nonNullable: true, 
      validators: [Validators.required, Validators.email] 
    }),
    password: new FormControl('', { 
      nonNullable: true, 
      validators: [Validators.required, Validators.minLength(6)] 
    }),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Veuillez renseigner tous les champs obligatoires avec un mot de passe valide.');
      return;
    }

    this.error.set('');
    const values = this.form.getRawValue();

    this.auth.register(values.name, values.email, values.password).subscribe({
      next: () => {
        void this.router.navigateByUrl('/profile');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[RegisterPage] Échec de l’inscription', error);
        this.error.set(error.error?.message ?? 'Erreur lors de la création du compte');
      },
    });
  }
}