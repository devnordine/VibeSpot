import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  standalone:true,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name });
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Chargement impossible', error.error?.message);
        this.error.set(error.error?.message ?? 'Impossible de charger le profil.');
      },
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    this.error.set('');
    this.message.set('');
    if (this.form.invalid) {
      return;
    }

    this.auth.update(this.form.getRawValue().name).subscribe({
      next: () => this.message.set('Profil mis à jour.'),
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Enregistrement impossible', error.error?.message);
        this.error.set(error.error?.message ?? 'Impossible de mettre à jour le profil.');
      },
    });
  }
}
