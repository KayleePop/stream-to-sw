#!/usr/bin/env node

const fs = require('fs')
const getStdin = require('get-stdin')

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

async function main () {
  let src = fs.readFileSync(require.resolve('./worker.js'), 'utf-8')

  const interceptFunc = await getStdin()

  if (interceptFunc) {
    // groups matched
    // (// CLI REPLACE START)
    // (replaced code)
    // (// CLI REPLACE END)
    const replaceRegex = /(\/\/ CLI REPLACE START\n)([\s\S]*)\n(.*\/\/ CLI REPLACE END)/

    // include CLI REPLACE strings in output
    src = src.replace(replaceRegex, `$1${interceptFunc}$3`)
  }

  process.stdout.write(src)
}
