self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {
    title: 'E-Waste Update',
    body: 'You have a new notification.',
    tag: 'ewaste-default',
    url: '/'
  }

  try {
    const data = event.data.json()
    payload = {
      ...payload,
      ...data
    }
  } catch {
    payload.body = event.data.text()
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/pwa-192x192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' }
  }

  event.waitUntil(self.registration.showNotification(payload.title, notificationOptions))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }

      return undefined
    })
  )
})
