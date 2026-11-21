import type { Transport } from '@penrill/sync/session'

const MAX_BUFFERED = 4 * 1024 * 1024

export function webSocketTransport(url: string): Transport {
  return {
    connect(events) {
      const socket = new WebSocket(url)
      socket.onopen = () => events.open()
      socket.onmessage = event => {
        if (typeof event.data === 'string') events.message(event.data)
      }
      socket.onclose = event => events.close(event.code)
      return {
        send(message) {
          if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED) return false
          socket.send(JSON.stringify(message))
          return true
        },
        close() {
          if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
        }
      }
    }
  }
}
