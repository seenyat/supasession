import styles from '../css/app.module.scss'
import { doc } from '../components/FullScreen/FullScreen';

(async () => {
  while (!Spicetify?.showNotification) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const container = document.querySelector(
        `.${styles.supersession}.${styles.overlay}`
      );
      if (!container) {
        console.log('no container');
        return;
      }
      if (doc.webkitIsFullScreen) {
        document.exitFullscreen();
        container.classList.add(styles.hidden);
      }
    }
  });

  const container = document.createElement('div');
  container.classList.add(styles.supersession);
  container.classList.add(styles.overlay);
  container.classList.add(styles.hidden);
  const existingContainer = document.querySelector(
    `.${styles.supersession}.${styles.overlay}`
  );
  document.body.append(container);
  if (!existingContainer) {
    document.body.append(container);
  }

  // Show message on start.
  Spicetify.showNotification('Нныа!');
})();
