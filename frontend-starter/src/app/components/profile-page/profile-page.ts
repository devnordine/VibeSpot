import { Component, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  standalone: true,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    // Si l'utilisateur est déjà dans le Signal, on préremplit directement
    const current = this.auth.currentUser();
    if (current) {
      this.form.patchValue({ name: current.name });
    }
    // Puis on recharge les données fraîches depuis l'API
    this.load();
  }

  load(): void {
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.patchValue({ name: user.name });
      },
      error: (error) => console.error('[ProfilePage] Chargement impossible', error),
    });
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }

    this.auth.update(this.form.getRawValue().name).subscribe({
      next: (user) => console.debug('[ProfilePage] Profil mis à jour :', user.id),
      error: (error) => console.error('[ProfilePage] Enregistrement impossible', error),
    });
  }
}