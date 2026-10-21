import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// This entry point exists only in the packaged iOS app. The browser build
// continues to load app.js directly and never downloads native dependencies.
if (!Capacitor.isNativePlatform()) {
  throw new Error('Este paquete debe abrirse dentro de la aplicación iOS.');
}
document.documentElement.classList.add('native-app');
globalThis.GymTrackNative = Object.freeze({
  async exportBackup(text, name) {
    if (!/^gymtrack-(?:respaldo|recuperacion)-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
      throw new Error('El nombre del respaldo no es válido.');
    }
    const { value: canShare } = await Share.canShare();
    if (!canShare) throw new Error('No se pudo abrir el menú para guardar el respaldo.');
    const path = `gymtrack-backups/${name}`;
    const file = await Filesystem.writeFile({ path, directory: Directory.Cache, data: text, encoding: Encoding.UTF8, recursive: true });
    try {
      await Share.share({ title: 'Respaldo de GymTrack', files: [file.uri], dialogTitle: 'Guardar o compartir respaldo' });
      return 'shared';
    } catch (error) {
      if (error?.message === 'Share canceled') return 'cancelled';
      throw new Error('No se pudo compartir el respaldo. Vuelve a intentarlo.');
    } finally {
      // The share sheet has finished reading the temporary file. A cancelled
      // sheet must not delete the actual diary, only this cache copy.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
  },
});

// App code is loaded after the native adapter is available.
await import('./app.js');
