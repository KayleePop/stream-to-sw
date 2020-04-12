const test = require('muggle-test')
const assert = require('muggle-assert')
const { execSync } = require('child_process')
const fs = require('fs')

test('sets filter function correctly', () => {
  const filterFunction = '() => test'
  const output = execSync(`echo "${filterFunction}" | ./cli.js`)

  const workerSrc = fs.readFileSync(require.resolve('./worker.js')).toString()

  // everything after the // CLI REPLACE START comment flag
  const beforeReplace = workerSrc.replace(/\/\/ CLI REPLACE START[\s\S]+/, '')

  // everything before the // CLI REPLACE END comment flag
  const afterReplace = workerSrc.replace(/[\s\S]+\/\/ CLI REPLACE END/, '')

  assert(output.includes(filterFunction), 'output should include piped filter function')
  assert(output.includes(beforeReplace), 'output should include code before filter function')
  assert(output.includes(afterReplace), 'output should include code after filter function')
})
