import styles from '../css/app.module.scss'
import { io } from "socket.io-client";

const socket = io("ws://localhost:4512");
socket.on("connect", () => {
  console.log("connected");
});
socket.connect();
(async () => {
  while (!Spicetify?.showNotification) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const container = document.querySelector(
        `.${styles.supersession}.${styles.overlay}`
      );
      if (!container) {
        console.log("no container");
        return;
      }
      if (document.webkitIsFullScreen) {
        document.exitFullscreen();
        container.classList.add(styles.hidden);
      }
    }
  });

  const container = document.createElement("div");
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
  Spicetify.Platform.PlayerAPI._events.addListener(
    "queue_update",
    (data: any) => {
      console.log("QUEUE UPDATE:", data);
    }
  );

  // Show message on start.
  Spicetify.showNotification("Нныа!");
})();
