# Getzy

> A tiny yet capable HTTP/HTTPS client for Node.js.  
> Native. Promise-based. Pluggable.

---

## 📚 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
  - [As a Library](#as-a-library)
  - [CLI Usage](#cli-usage)
- [Request Options](#-request-options)
- [Constructor & Configuration](#-constructor--configuration)
- [Middleware & Integrations](#-middleware--integrations)
- [API](#-api)
- [Error Handling](#-error-handling)
- [Related](#-related)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

- **Native only** – Built using only Node.js's native `http`/`https` modules.
- **Promise-based** – Clean async/await interface.
- **Retries** – Automatic exponential backoff with jitter for retries.
- **Redirects** – Follows redirects (default up to 3; configurable).
- **Middleware Support** – Chain asynchronous plugins for logging, caching, authentication, etc.
- **Pluggable Integrations** – Easily compose reusable integration logic.
- **CLI Support** – Use `getzy` from the terminal for quick HTTP requests.

---

## 🚀 Installation

### As a Library

Install via npm:

```bash
npm install getzy
```

### As a CLI

Install globally:

```bash
npm install -g getzy
```

Or clone the repo and link it locally:

```bash
git clone https://github.com/Sectly/getzy.git
cd getzy
npm install
npm link
```

Now you can use `getzy` directly in your terminal.

---

## 🛠 Usage

### As a Library

Create a client instance and make requests:

```js
const Getzy = require('getzy');
const client = new Getzy();

// Optional: register an integration with before and after middleware
client.useIntegration({
  before: async ({ ctx }) => {
    console.log(`[→] ${ctx.method} ${ctx.url}`);
    return { ctx };
  },
  after: async ({ ctx, result }) => {
    console.log(`[✓] ${result.statusCode} ${result.statusText}`);
    return { ctx, result };
  }
});

(async () => {
  try {
    const res = await client.get('https://jsonplaceholder.typicode.com/posts/1');
    console.log(res.statusCode); // e.g., 200
    console.log(res.body.title); // Post title (if JSON response)
  } catch (err) {
    console.error('Request failed:', err);
  }
})();
```

### CLI Usage

Getzy CLI enables you to perform HTTP requests directly from the terminal.

#### Basic Examples

- **Standard GET with JSON response:**

  ```bash
  getzy get https://jsonplaceholder.typicode.com/posts/1 --json --pretty
  ```

- **GET without specifying method (defaults to GET):**

  ```bash
  getzy https://jsonplaceholder.typicode.com/posts/1 --json
  ```

- **POST with JSON body provided via argument:**

  ```bash
  getzy post https://api.example.com -H Content-Type:application/json -d '{"hello":"world"}'
  ```

- **Using piped input for the request body:**

  ```bash
  cat body.json | getzy post https://api.example.com -p userId=5 -s
  ```

- **Chaining output with a tool like `jq`:**

  ```bash
  getzy get https://jsonplaceholder.typicode.com/posts/1 --json | jq .
  ```

#### CLI Options

- `-X, -x <method>`  
  Set the HTTP method (GET, POST, etc). Overrides the default (GET).

- `-H, --headers k:v`  
  Add custom headers. Can be repeated for multiple headers.

- `-p, --params k=v`  
  Add query parameters. Can be repeated for multiple parameters.

- `-d, --body <json>`  
  Provide raw JSON or string as the request body.  
  > **Note:** If the request body is piped via stdin and is valid JSON, it will be parsed; otherwise, raw text is used.

- `-T, --timeout <ms>`  
  Set the request timeout in milliseconds.

- `-r, --retries <n>`  
  Set the maximum number of retry attempts.

- `-R, --redirects <n>`  
  Set the maximum number of redirects to follow (use 0 to disable).

- `--json`  
  Automatically add `Accept: application/json` header.

- `--pretty`  
  Prettify JSON output.

- `-s, --silent`  
  Output only the response body (suppress status and headers).

- `-v, --version`  
  Display the CLI version.

- `-h, --help`  
  Display the help message.

Piping is supported:
- **Input:** Pipe request body via stdin.
- **Output:** Response body is printed to stdout while logs/status info goes to stderr.

---

## 🪛 Request Options

Each request method accepts an optional `options` object:

```js
{
  headers: {},         // Custom headers (merged with default headers)
  body: {},            // Request body (JSON or string). **Streaming is not supported.**
  timeout: 10000,      // Timeout in ms
  redirects: 3,        // Maximum redirects (0 disables redirects)
  retries: 0,          // Maximum retry attempts
  baseRetryDelay: 500, // Initial delay for exponential backoff (ms)
  maxRetryDelay: 2000, // Maximum delay between retries (ms)
  params: {}           // Query parameters to append to URL
}
```

> **Note:** When a request body is provided as an object, it is JSON-stringified automatically.  
> Also, if no `Content-Type` header is set and the body is an object, the client sets `Content-Type` to `application/json`.

---

## 🔧 Constructor & Configuration

When instantiating `Getzy`, you can provide a configuration object to set defaults for all requests:

```js
const client = new Getzy({
  defaultHeaders: { 'Accept': 'application/json' },
  defaultMaxRedirects: 3,
  defaultMaxRetryDelay: 2000,
  defaultTimeout: 10000,
  defaultRetries: 0,
  defaultBaseRetryDelay: 500,
});
```

The configuration parameters include:

- **defaultHeaders:** Default HTTP headers for every request.
- **defaultMaxRedirects:** Maximum number of redirects to follow.
- **defaultMaxRetryDelay:** Maximum delay between retry attempts.
- **defaultTimeout:** Request timeout in milliseconds.
- **defaultRetries:** Number of retry attempts.
- **defaultBaseRetryDelay:** Initial delay before retrying a request.

---

## 🔌 Middleware & Integrations

Getzy supports middleware in two phases:

1. **Before Middleware:**  
   Modify the request context (e.g., add headers, log request details).  
   If a middleware returns a result, the remaining request is skipped and the result is passed to the after phase.

2. **After Middleware:**  
   Process the response (e.g., logging, error handling) before returning it to the caller.

Register middleware using:

```js
// Single middleware function for a specific phase:
client.use(async ({ ctx }) => {
  ctx.options.headers = {
    ...ctx.options.headers,
    Authorization: 'Bearer your-token',
  };
  return { ctx };
}, 'before');

// As an integration (plugin) with both phases:
client.useIntegration({
  before: async ({ ctx }) => { /* ... */ return { ctx }; },
  after: async ({ ctx, result }) => { /* ... */ return { ctx, result }; }
});
```

Additionally, you can register a global middleware error handler:

```js
client.onMiddlewareError((err, ctx, phase) => {
  console.error(`Middleware error in ${phase} phase:`, err);
});
```

---

## 📦 API

### Request Methods

```js
client.get(url, options?)
client.post(url, options?)
client.put(url, options?)
client.delete(url, options?)
client.head(url, options?)
client.patch(url, options?)
client.options(url, options?)
```

### Middleware

```js
// Register a middleware for a phase ('before' or 'after')
client.use(fn, phase);

// Register an integration (object with before and/or after functions)
client.useIntegration({ before, after });

// Register a global middleware error handler
client.onMiddlewareError((err, ctx, phase) => { ... });
```

---

## 🚨 Error Handling

- If a request fails (e.g., non-2xx response, network error, timeout), the returned error object will include:
  - **error.response:** The response object (if available) containing status, headers, body, etc.
  - **error.request:** Details of the attempted request.
- Middleware errors are propagated via the global error handler (if registered) and will abort the request.

---

## 🔍 Related

Here’s how Getzy compares to other popular HTTP clients:

| Feature / Client     | Getzy | Axios | Got | Fetch (Node) | tiny-json-http |
| -------------------- |:-----:|:-----:|:---:|:------------:|:--------------:|
| Native Modules Only  | ✅    | ❌    | ❌  | ✅           | ✅             |
| Promise Support      | ✅    | ✅    | ✅  | ✅           | ✅             |
| Retries (w/ backoff) | ✅    | ❌    | ✅  | ❌           | ❌             |
| Redirect Support     | ✅    | ✅    | ✅  | ✅           | ✅             |
| Middleware Support   | ✅    | ⚠️    | ✅  | ❌           | ❌             |
| Plugin System        | ✅    | ❌    | ✅  | ❌           | ❌             |
| Streaming Support    | ❌    | ✅    | ✅  | ✅           | ❌             |
| Cookie Management    | ⚠️    | ✅    | ✅  | ❌           | ❌             |
| Browser Compatible   | ❌    | ✅    | ❌  | ✅           | ✅             |
| Lightweight          | ✅    | ❌    | ⚠️  | ✅           | ✅             |

> **Legend:** ✅ Supported ❌ Not supported ⚠️ Partial support or requires additional workarounds

---

## 🤝 Contributing

Contributions, ideas, and feedback are welcome!  
Feel free to open an issue or pull request on [GitHub](https://github.com/Sectly/getzy).

---

## 📄 License

BSD 3-Clause License  
© 2025 [Sectly](https://github.com/Sectly)