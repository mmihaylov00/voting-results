import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import * as Highcharts from 'highcharts';
import { provideHighcharts } from 'highcharts-angular';
import { House, LogOut, LucideAngularModule, Moon, PanelLeftClose, PanelLeftOpen, Sun, Users, Vote } from 'lucide-angular';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      LucideAngularModule.pick({
        House,
        Vote,
        Users,
        LogOut,
        PanelLeftClose,
        PanelLeftOpen,
        Sun,
        Moon,
      }),
    ),
    provideHighcharts({
      instance: async () => Highcharts
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
