import { Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-tracks-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnInit, OnDestroy {
  private readonly service = inject(TrackService);

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly listError = signal('');

  // Mission 5 : Anti-double clic & Feedback SnackBar
  readonly deletingId = signal<string | null>(null);
  readonly snackbarMessage = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly searchTerm = signal('');
  readonly filteredTracks = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.tracks();
    return this.tracks().filter(
      (t) => t.title.toLowerCase().includes(term) || t.originalName?.toLowerCase().includes(term)
    );
  });

  readonly uploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');

  readonly audioUrl = signal('');
  readonly currentTrack = signal<Track | null>(null);

  readonly title = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  file?: File;

  ngOnInit(): void {
    this.load();
  }

  choose(event: Event): void {
    this.uploadError.set('');
    this.uploadSuccess.set('');
    
    this.uploadProgress.set(45);
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];

    if (!selectedFile) {
      this.file = undefined;
      return;
    }

    if (!this.isValidAudioFile(selectedFile)) {
      this.file = undefined;
      input.value = '';
      return;
    }

    this.file = selectedFile;
    if (!this.title.value.trim()) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '');
      this.title.setValue(cleanName);
    }
  }

  load(): void {
    this.loading.set(true);
    this.listError.set('');

    this.service.list(this.page(), 5).subscribe({
      next: (response) => {
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: () => {
        this.listError.set('Impossible de charger les pistes audio.');
        this.loading.set(false);
      },
    });
  }

  go(targetPage: number): void {
    if (targetPage >= 1 && targetPage <= this.pages() && targetPage !== this.page()) {
      this.page.set(targetPage);
      this.load();
    }
  }

  
upload(): void {
  
  if (this.uploading() || !this.file) return;
  if (!this.isValidAudioFile(this.file)) return;

  const trackTitle = this.title.value.trim() || this.file.name;

  
  this.uploading.set(true);
  this.uploadProgress.set(0);
  this.uploadError.set('');
  this.uploadSuccess.set('');

  this.service.uploadWithProgress(this.file, trackTitle).subscribe({
    next: (event: HttpEvent<Track>) => {
      
      if (event.type === HttpEventType.UploadProgress && event.total) {
        const percent = Math.round((100 * event.loaded) / event.total);
        this.uploadProgress.set(percent);
      } 
     
      else if (event.type === HttpEventType.Response) {
        const createdTrack = event.body;
        this.uploading.set(false);
        this.uploadProgress.set(100);
        this.uploadSuccess.set(`« ${createdTrack?.title ?? trackTitle} » ajouté avec succès.`);
        this.resetUploadForm();
        this.page.set(1);
        this.load();
      }
    },
    
    error: (err: HttpErrorResponse) => {
      this.uploading.set(false);
      this.uploadProgress.set(0);
      this.uploadError.set(err.error?.message ?? 'Échec du téléversement sur le serveur.');
    },
  });
}

  deleteTrack(track: Track): void {
    if (this.deletingId()) return;

    const confirmed = window.confirm(`Voulez-vous vraiment supprimer « ${track.title} » ?`);
    if (!confirmed) return;

    this.deletingId.set(track.id);

    this.service.delete(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.showSnackbar(`« ${track.title} » a été supprimé avec succès.`, 'success');

        if (this.currentTrack()?.id === track.id) {
          this.clearAudio();
        }
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.deletingId.set(null);

        if (err.status === 404) {
          this.showSnackbar(`La piste « ${track.title} » a déjà été supprimée ailleurs.`, 'error');
          this.load();
        } else if (err.status === 403) {
          this.showSnackbar(`Suppression refusée : vous n'êtes pas propriétaire de « ${track.title} ».`, 'error');
        } else {
          this.showSnackbar(`Impossible de supprimer « ${track.title} ».`, 'error');
        }
      },
    });
  }

  play(track: Track): void {
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        this.clearAudio();
        this.currentTrack.set(track);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.listError.set(`Lecture impossible pour « ${track.title} ».`),
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  ngOnDestroy(): void {
    this.clearAudio();
  }

  private showSnackbar(text: string, type: 'success' | 'error'): void {
    this.snackbarMessage.set({ text, type });
    setTimeout(() => {
      if (this.snackbarMessage()?.text === text) {
        this.snackbarMessage.set(null);
      }
    }, 4000);
  }

  private clearAudio(): void {
    const current = this.audioUrl();
    if (current) {
      URL.revokeObjectURL(current);
      this.audioUrl.set('');
      this.currentTrack.set(null);
    }
  }

  private isValidAudioFile(file: File): boolean {
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name);
    if (!isAudio) {
      this.uploadError.set('Format de fichier invalide. Sélectionnez un fichier audio (MP3, WAV, FLAC...).');
      return false;
    }

    if (file.size >= MAX_FILE_SIZE_BYTES) {
      const sizeMo = (file.size / (1024 * 1024)).toFixed(2);
      this.uploadError.set(`Le fichier (${sizeMo} Mo) dépasse la limite autorisée de 25 Mo.`);
      return false;
    }

    return true;
  }

  private resetUploadForm(): void {
    this.file = undefined;
    this.title.setValue('');
    this.uploadProgress.set(0);
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
  }
}