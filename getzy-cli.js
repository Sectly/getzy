#!/usr/bin/env node

// @Name: Getzy CLI
// @Description: The CLI for the tiny yet capable HTTP/HTTPS client for Node.js. Native. Promise-based. Pluggable.
// @Author: @Sectly
// @Version: 1.0.1
// @License: BSD 3-Clause License

/**
 * BSD 3-Clause License
 * 
 * Copyright (c) 2025, Sectly
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of Sectly nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const Getzy = require('./getzy');
const { version } = require('./package.json');
const client = new Getzy();

const args = process.argv.slice(2);
let method = 'get';
let url = '';
let silent = false;
let pretty = false;

const options = {
  headers: {},
  params: {}
};

// Define valid HTTP methods for flexibility
const validMethods = new Set(["get", "post", "put", "delete", "head", "patch", "options"]);

// If the first argument is a valid HTTP method, use it and remove it from args
if (args.length > 0 && !args[0].startsWith('-') && validMethods.has(args[0].toLowerCase())) {
  method = args.shift().toLowerCase();
}

// If the next argument is non-flag and URL isn't set, treat it as the URL
if (args.length > 0 && !args[0].startsWith('-') && !url) {
  url = args.shift();
}

async function main() {
  await parseArgs();

  if (!url) {
    console.error('❌ Missing URL.');
    printHelp();

    process.exit(2);
  }

  // Validate the URL
  try {
    new URL(url);
  } catch (err) {
    console.error(`❌ Invalid URL provided: ${url}`);
    process.exit(3);
  }

  // If data is being piped into stdin, read it as the body
  if (!process.stdin.isTTY) {
    let input = '';

    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
      input += chunk;
    }

    input = input.trim();

    try {
      options.body = JSON.parse(input);
    } catch {
      options.body = input; // Fallback to raw text if JSON parsing fails
    }
  }

  await makeRequest();
}

async function parseArgs() {
  // Process remaining CLI flags and arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg.toLowerCase()) {
      case '--help':
      case '-h':
        printHelp();
        break;

      case '--version':
      case '-v':
        console.log(`Getzy CLI v${version}`);
        process.exit(0);
        break;

      case '-x':
      case '-X':
        method = args[++i]?.toLowerCase();

        if (!validMethods.has(method)) {
          console.error(`❌ Invalid HTTP method: ${method}`);
          process.exit(4);
        }

        break;

      case '--json':
        // Set Accept header for JSON response
        addHeader('Accept', 'application/json');
        break;

      case '--headers':
      case '-H': {
        const next = args[++i];

        if (!next || next.indexOf(':') === -1) {
          console.error('❌ Invalid header format. Expected format: key:value');
          process.exit(5);
        }

        const [rawKey, ...rawVal] = next.split(':');
        const key = rawKey.trim();
        const value = rawVal.join(':').trim();

        if (!key || !value) {
          console.error('❌ Invalid header. Both key and value must be non-empty.');
          process.exit(5);
        }

        addHeader(key, value);
        break;
      }

      case '--params':
      case '-p': {
        const next = args[++i];

        if (!next || next.indexOf('=') === -1) {
          console.error('❌ Invalid query parameter format. Expected format: key=value');
          process.exit(6);
        }

        const [rawKey, rawValue] = next.split('=');
        const key = rawKey.trim();
        const value = rawValue.trim();

        if (!key || !value) {
          console.error('❌ Invalid query parameter. Both key and value must be non-empty.');
          process.exit(6);
        }

        addParam(key, value);
        break;
      }

      case '--body':
      case '-d': {
        const bodyInput = args[++i];

        try {
          options.body = JSON.parse(bodyInput);
        } catch {
          options.body = bodyInput;
        }

        break;
      }

      case '--timeout':
      case '-t':
      case '-T': {
        const timeoutVal = parseInt(args[++i], 10);

        if (isNaN(timeoutVal) || timeoutVal < 0) {
          console.error('❌ Timeout must be a non-negative number.');
          process.exit(7);
        }

        options.timeout = timeoutVal;
        break;
      }

      case '--retries':
      case '-r': {
        const retriesVal = parseInt(args[++i], 10);

        if (isNaN(retriesVal) || retriesVal < 0) {
          console.error('❌ Retries must be a non-negative number.');
          process.exit(8);
        }

        options.retries = retriesVal;
        break;
      }

      case '--redirects':
      case '-R': {
        const redirectsVal = parseInt(args[++i], 10);

        if (isNaN(redirectsVal) || redirectsVal < 0) {
          console.error('❌ Redirects must be a non-negative number.');
          process.exit(9);
        }

        options.redirects = redirectsVal;
        break;
      }

      case '--pretty':
        pretty = true;
        break;

      case '--silent':
      case '-s':
        silent = true;
        break;

      default:
        // If argument doesn't start with '-' and URL is not set, treat it as the URL
        if (!url && !arg.startsWith('-')) {
          url = arg;
        }

        break;
    }
  }
}

// Helper function to add header values and handle multiple occurrences
function addHeader(key, value) {
  if (options.headers.hasOwnProperty(key)) {
    if (Array.isArray(options.headers[key])) {
      options.headers[key].push(value);
    } else {
      options.headers[key] = [options.headers[key], value];
    }
  } else {
    options.headers[key] = value;
  }
}

// Helper function to add query parameters and handle multiple occurrences
function addParam(key, value) {
  if (options.params.hasOwnProperty(key)) {
    if (Array.isArray(options.params[key])) {
      options.params[key].push(value);
    } else {
      options.params[key] = [options.params[key], value];
    }
  } else {
    options.params[key] = value;
  }
}

async function makeRequest() {
  try {
    const res = await client[method](url, options);

    if (!res) {
      throw new Error(`❌ {url} returned null`);
    }

    if (!silent) {
      console.log(`✅ ${res.statusCode} ${res.statusText}`);
      console.log('↩ Headers:', JSON.stringify(res.headers, null, 2));
    }

    const output =
      typeof res.body === 'object' && res.body !== null
        ? JSON.stringify(res.body, null, pretty ? 2 : 0)
        : res.body;

    process.stdout.write(output + '\n');
  } catch (err) {
    const res = err.response;
    console.error(`\n❌ ${err.message}`);

    if (res) {
      if (!silent) {
        console.error(`Status: ${res.statusCode}`);
        console.error('Headers:', JSON.stringify(res.headers, null, 2));
      }

      console.error(
        'Body:',
        typeof res.body === 'object'
          ? JSON.stringify(res.body, null, 2)
          : res.body
      );
    }

    process.exit(1);
  }
}

function printHelp() {
  console.log(`
🛠 Getzy CLI — A tiny yet capable HTTP/HTTPS client

Usage:
  getzy [<method>] <url> [options]

If the HTTP method is omitted, GET is assumed.
Examples:
  # Using explicit method:
  getzy get https://jsonplaceholder.typicode.com/posts/1 --json --pretty

  # Without specifying method (defaults to GET):
  getzy https://jsonplaceholder.typicode.com/posts/1 --json

  # POST request with JSON body provided via argument:
  getzy post https://api.example.com -H Content-Type:application/json -d '{"hello":"world"}'

  # Multiple headers and query parameters:
  getzy put https://api.example.com/resource \\
    -H Authorization:Bearer%20token \\
    -H Accept:application/json \\
    -p userId=123 \\
    -p filter=active \\
    -d '{"update":true}'

  # Using piped input for the request body:
  cat body.json | getzy post https://api.example.com -p userId=5 -s

  # Chaining output (using jq for pretty-printing):
  getzy get https://jsonplaceholder.typicode.com/posts/1 --json | jq .

Options:
  -X, -x <method>        HTTP method (GET, POST, etc). Overrides the method provided as the first argument.
  -H, --headers k:v      Add custom header (repeatable)
  -p, --params k=v       Add query param (repeatable)
  -d, --body <json>      Provide raw JSON or string body
  -T, --timeout <ms>     Timeout in milliseconds
  -r, --retries <n>      Number of retry attempts
  -R, --redirects <n>    Maximum redirects to follow
  --json                 Adds Accept: application/json header
  --pretty               Prettify JSON response output
  -s, --silent           Output only the body (suppress status & headers)
  -v, --version          Show CLI version
  -h, --help             Show this help message

Piping:
  • Pipe input: Pass request body via stdin (e.g., \`cat file.json | getzy post <url>\`)
  • Pipe output: Response body is sent to stdout, while logs are sent to stderr.

Note:
  When piping input, if the input is valid JSON it will be parsed;
  otherwise, the raw text is used as the body.
`);
  process.exit(0);
}

main();
