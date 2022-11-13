import styles from '../css/app.module.scss'

(async () => {
  while (!Spicetify?.showNotification) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const container = document.createElement("div");
  container.classList.add(styles.supersession)
  container.classList.add(styles.hidden)
  const existingContainer = document.querySelector(`${styles.supersession}`);
  console.log('adding to body')
  document.body.append(container)
  if (!existingContainer){
  }
  Spicetify.Platform.PlayerAPI._events.addListener("queue_update", (data:any) => {
    console.log(data)
  });

  // Show message on start.
  Spicetify.showNotification("Нныа!");
})()
