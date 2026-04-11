// useNotification.js
export const useNotification = () => {
  const requestPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const showNotification = (title, body, icon) => {
    if (document.hasFocus()) return;
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: icon || '/icon.png',
      tag: 'justus-message',
      silent: false
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 5000);
  };

  return { requestPermission, showNotification };
};
