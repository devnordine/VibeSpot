import { inject, provideAppInitializer } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { AuthService } from './app/shared/services/auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    // withComponentInputBinding : les paramètres de route (:id) et `data`
    // sont injectés directement dans les input() des composants.
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Restaure la session au démarrage (après la construction d'AuthService)
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
}).catch(console.error);
