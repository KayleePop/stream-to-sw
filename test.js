const test = require('muggle-test')
const assert = require('muggle-assert')

// service worker registered to intercept everything beginning with '/test'
// via cli in package.json test script
const registerStreamToSw = require('./index.js')

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

// stream of Uint8Arrays 1-10
async function * countTo10 () {
  for (let i = 1; i <= 10; i++) {
    yield new TextEncoder().encode(i)
    await sleep(Math.random() * 5) // wait 0-5ms
  }
}

// stream of Uint8Arrays 10-1
async function * countDownFrom10 () {
  for (let i = 10; i >= 1; i--) {
    await sleep(Math.random() * 5) // wait 0-5ms
    yield new TextEncoder().encode(i)
  }
}

const readyPromise = registerStreamToSw('./testWorker.js', async (req, res) => {
  const path = req.url.replace(window.origin, '')

  switch (path) {
    case '/test/penguin': {
      return 'penguin'
    }
    case '/test/multiline': {
      return 'penguins\nlove\ncold'
    }
    case '/test/404': {
      res.status = 404
      return
    }
    case '/test/status': {
      res.statusText = 'OK'
      return
    }
    case '/test/header': {
      res.headers = req.headers
      return
    }
    case '/test/increasing': {
      return countTo10()
    }
    case '/test/decreasing': {
      return countDownFrom10()
    }
    case '/test/reqJson': {
      req.headers['content-type'] = 'text/json'
      return JSON.stringify(req)
    }
    case '/test/requestBody': {
      const body = await new window.Response(req.body).text()
      return body
    }
  }
})

test('simple fetch', async () => {
  await readyPromise

  const response = await window.fetch('/test/penguin')
  const text = await response.text()
  assert.equal(text, 'penguin')
})

test('default status code should be 200', async () => {
  await readyPromise

  const response = await window.fetch('/test/penguin')
  assert(response.ok, 'response.ok should be true')
  assert.equal(response.status, 200, 'response.status should be 200')
})

test('setting status code', async () => {
  await readyPromise

  const response = await window.fetch('/test/404')
  assert.equal(response.status, 404, 'response status code should match the res object')
})

test('setting statusText', async () => {
  await readyPromise

  const response = await window.fetch('/test/status')
  assert.equal(response.statusText, 'OK', 'response status code should be set')
})

test('read and set header', async () => {
  await readyPromise

  // /test/header reads headers from request and copies them to response
  const response = await window.fetch('/test/header', { headers: { 'content-type': 'image/jpeg' } })
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg')
})

test('multiline string as response', async () => {
  await readyPromise

  const response = await window.fetch('/test/multiline')
  const text = await response.text()
  assert.equal(text, 'penguins\nlove\ncold')
})

test('request properties should be passed correctly', async () => {
  await readyPromise

  const request = new window.Request('/test/reqJson')

  const response = await window.fetch(request)
  const responseRequest = await response.json()

  // properties of the request that should be present on the Req object
  const props = [
    'method',
    'mode',
    'url',
    'credentials',
    'cache',
    'context',
    'destination',
    'redirect',
    'integrity',
    'keepalive',
    'isHistoryNavigation'

    // referrer changes from the original request, so don't test those
    // 'referrer'
    // 'referrerPolicy'
  ]

  for (const prop of props) {
    assert.equal(
      request[prop],
      responseRequest[prop],
      `Req[${prop}] should equal fetch(Request[${prop}])`
    )
  }

  for (const [key, value] of request.headers) {
    assert.equal(
      responseRequest.headers[key],
      value,
      `Req.headers[${key}] should equal fetch(Request.headers[${key}])`
    )
  }
})

test('body should be passed into the Req object', async () => {
  await readyPromise

  // /test/requestBody copies the request body into the response body
  const response = await window.fetch('/test/requestBody',
    {
      method: 'POST',
      body: new window.Blob(['penguin'])
    }
  )
  const text = await response.text()
  assert.equal(text, 'penguin')
})

test('concurrent streams', async () => {
  await readyPromise

  const fetchText = async (path) => {
    const res = await window.fetch(path)
    const text = await res.text()
    return text
  }

  const [increasing, decreasing] = await Promise.all([
    fetchText('/test/increasing'),
    fetchText('/test/decreasing')
  ])

  assert.equal(increasing, '12345678910')

  assert.equal(decreasing, '10987654321')
})
