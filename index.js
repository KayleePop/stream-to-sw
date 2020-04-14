async function nextSWPostMessage () {
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener(
      'message',
      e => resolve(e.data),
      { once: true }
    )
  })
}

// res object in requestHandler() ( registerStreamToSw('/worker.js', (req, res) => {}) )
class Res {
  constructor (id) {
    // the id of this stream in the service worker. Used to differentiate postMessages
    this._id = id

    this.headers = {}
    this.status = 200 // 200 is default, it means success
    this.statusText = ''

    // set immediately, so we don't miss the first pull
    this._pullingPromise = this._untilPullMessage()

    // used to terminate polling for SW 'pull' messages
    this._finished = false
  }

  async _untilPulling () {
    await this._pullingPromise

    this._pullingPromise = this._untilPullMessage()
  }

  async _untilPullMessage () {
    while (!this._finished) {
      const message = await nextSWPostMessage()

      // if this message is for a different stream
      if (message.id !== this._id) {
        continue
      }

      // if the fetch stream is pulling
      if (message.type === 'pull') {
        return
      }

      // if readableStream.cancel() was called
      if (message.type === 'cancel') {
        throw new Error('service worker response stream was cancelled')
      }
    }
  }

  _sendMessageToSW (obj) {
    obj.id = this._id
    navigator.serviceWorker.controller.postMessage(obj)
  }

  _sendMetadataToSW () {
    // the metadata is used in the `new Response()` constructor that's passed to fetchEvent.respondWith()
    this._sendMessageToSW({
      status: this.status,
      statusText: this.statusText,
      headers: this.headers
    })
  }

  async _sendStream (asyncIterator) {
    for await (const chunk of asyncIterator) {
      await this._untilPulling()

      if (!ArrayBuffer.isView(chunk)) {
        throw new Error('values from asyncIterator must be TypedArrays')
      }

      // to be sent through ReadableStream in the fetch response
      this._sendMessageToSW({ chunk })
    }

    this._finished = true
    this._sendMessageToSW({ type: 'done' })
  }
}

module.exports = async function registerStreamToSw (workerPath, requestHandler) {
  navigator.serviceWorker.addEventListener('message', async (e) => {
    const message = e.data

    // ping to ensure postmessages work
    // this also allows one client to respond to another's fetch requests
    if (message.type === 'ping') {
      navigator.serviceWorker.controller.postMessage({
        type: 'pong',
        id: message.id
      })
    }

    if (message.type === 'request') {
      const req = message.plainRequest
      const res = new Res(message.id)

      // if nothing is returned from the handler, set it to an empty array
      let asyncIterator = await requestHandler(req, res) || []

      // if string is returned, pass it as an array of one ArrayBuffer
      if (typeof asyncIterator === 'string') {
        asyncIterator = [new TextEncoder().encode(asyncIterator)]
      }

      // send metadata after the requestHandler resolves
      // this should be after the metadata properties of the Res object are set
      // asumming the res object isn't passed to a setTimeout or something outside the normal awaits
      res._sendMetadataToSW()

      await res._sendStream(asyncIterator)
    }
  })

  navigator.serviceWorker.register(workerPath)

  // await until service worker is attached to client (ready to intercept fetch requests)
  await navigator.serviceWorker.ready

  // sometimes the controller isn't attached yet despite ready resolving
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
    })
  }
}
