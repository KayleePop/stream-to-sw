# stream-to-sw

[![Node.js CI](https://github.com/KayleePop/stream-to-sw/workflows/Node.js%20CI/badge.svg)](https://github.com/KayleePop/stream-to-sw/actions)
[![standard badge](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![npm](https://img.shields.io/npm/v/stream-to-sw.svg)](https://www.npmjs.com/package/stream-to-sw)

Intercept fetch requests with a service worker, but process the response on the main thread. For example, a node stream can be used to respond to an html5 video tag.

## Install

```
npm install stream-to-sw
```

## Usage

Use the CLI to generate the service worker file. Here we place it at the root of the site's http directory.

`$ echo '(path, request) => path.startsWith('/prefix/')' | stream-to-sw > worker.js`

``` js
const registerStreamToSw = require('stream-to-sw')

main()
async function main () {
  // resolves when ready to intercept fetch requests
  await registerStreamToSw('/worker.js', async (req, res) => {
    if (req.path === '/prefix/ping') {
      res.headers['content-type'] = 'text/plain'
      res.status = 200 // 200 is the default response code, so this is actually unecessary
      res.statusText = 'successful fetch!'

      // can respond with string
      return 'pong'
    }

    if (req.path === '/prefix/video.mp4') {
      res.headers['content-type'] = 'video/mp4'

      // can respond with AsyncIterator / Iterator
      // node streams are async iterators as of node 10!
      return nodeStreamOfVideo
    }
  })

  // create video tag after await, to make sure the fecth is intercepted
  document.body.innerHTML = `<video src="/prefix/video.mp4"></video>`

  const response = await fetch('/prefix/ping')
  const text = await response.text()
  console.log(text) // => 'pong'
}
```

## Behavior

The service worker pings all windows in its scope and waits for a reply from an active StreamToSw instance. This ensures that postMessage is available and working because it's needed to pass the metadata and response body to the serviceWorker. It also allows a request to be delayed until the requestHandler is registered on the window and the service worker is properly attached to that window.

Since all windows under the serviceWorker's scope are pinged, there's no guarentee that the StreamToSw request handler executes on the same thread that made the fetch request. (so don't rely on the tab's state when processing responses)

This pinging also allows tabs and iframes to have their intercepted fetch requests processed on a different thread. This means that an iframe can have its src intercepted by its parent window, and a requestHandler singleton could be registered that still processes requests for all tabs.

## API

### CLI
Stdin is used to replace the [arrow function here](./worker.js#L33) which determines whether a fetch request should be intercepted and sent as a `request` event or allowed to be sent as a normal HTTP request.

#### Intercept Function
`(path, request) => !!shouldIntercept`

The path argument is `request.url` but stripped of the origin (so it starts with `/` instead of `http://`).

The request argument is `fetchEvent.request` as it exists in the serviceWorker (this intercept function runs on the service worker directly)

Return a truthy value to intercept the request or a falsy value to let the browser handle it normally.

### registerStreamToSw

`async function registerStreamToSw (workerPath, requestHandler)`

```js
const registerStreamToSw = require('stream-to-sw')

await registerStreamToSw('/worker.js', async (req, res) => {})
```

Register a RequestHandler callback that processes the requests that are intercepted by StreamToSw.

Returns a promise that resolves once StreamToSw is fully initialized and ready to intercept fetch Requests. (Service Worker is ready and attached to this client)

### Worker Path

`workerPath` is passed into [`navigator.serviceWorker.register()`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register). It should be a path to the worker file generated by the CLI. The paths are based on the site's HTTP file structure, so relative paths are relative to the current url.

If in doubt, place the worker file in the site's root so it can intercept all fetch requests, for example at `/worker.js`, then use the intercept function piped into the CLI to only intercept specific requests.

### Request Handler

`async function (request, response) => asyncIterator {}`

`requestHandler` is called whenever the service worker intercepts a fetch request. The iterator it returns is used in a [for await loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) to send the body data for the response stream. Each iteration waits for the response readableStream to pull, then it sends that chunk to the service worker via postMessage.

Anything that works in a [for await loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) will work, so normal arrays/iterators are fine. However, the iterator's values must be [TypedArrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays) in order to work with the readableStream used for the Response. (node Buffers are typedArrays)

A plain string can be also be returned from the requestHandler, and it will be automatically converted into an array of Uint8Arrays (one for each line) using [TextEncoder](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder)

If nothing is returned, the response body is empty.

#### request

The request object is a plain object version of [`fetchEvent.request`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/request)

The properties: 'method', 'mode', 'url', 'credentials', 'cache', 'context', 'destination', 'redirect', 'integrity', 'referrer', 'referrerPolicy', 'keepalive', 'isHistoryNavigation', are all included from the [request object](https://developer.mozilla.org/en-US/docs/Web/API/Request)

'headers' is also included, but as a plain associative array instead of a `Header` object

'body' is also resolved and included as a blob

#### response

A [Response object](https://developer.mozilla.org/en-US/docs/Web/API/Response/Response) is constructed using this object for metadata and the returned iterator as the body. The following properties of the response object are passed into the `init` options object of the Response.

```js
{
  headers: Object, // associative array of HTTP headers to include on the response
  status: Number, // HTTP status code to respond with, Default: 200
  statusText: String // the status message to respond with
}
```

This metadata is sent to the service worker immediately after the requestHandler finishes execution. If the metadata properties of the response object are changed after this (such as with setTimeout), those changes will be lost.


## Fork

This project started as a fork of [Browser Server](https://github.com/mafintosh/browser-server)
