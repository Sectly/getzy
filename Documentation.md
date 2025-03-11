# Getzy Extended Documentation

This document extends the information provided in the README by offering in-depth details, advanced code examples, and practical middleware use cases. It is designed to serve as a comprehensive guide that goes beyond the basics covered in the README.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Extended Overview](#2-extended-overview)
3. [Architecture and Design Details](#3-architecture-and-design-details)
   - [Internal Workflow](#internal-workflow)
   - [Middleware Phases](#middleware-phases)
4. [Deep Dive into API & Request Options](#4-deep-dive-into-api--request-options)
   - [HTTP Methods and Their Nuances](#http-methods-and-their-nuances)
   - [Advanced Request Options](#advanced-request-options)
5. [In-Depth Middleware & Integrations](#5-in-depth-middleware--integrations)
   - [Before vs. After Middleware](#before-vs-after-middleware)
   - [Global Error Handling](#global-error-handling)
6. [Additional Code Examples & Use Cases](#6-additional-code-examples--use-cases)
   - [Logging Middleware](#logging-middleware)
   - [Caching Middleware](#caching-middleware)
   - [Basic Authentication Middleware](#basic-authentication-middleware)
   - [Simple Cookie Management Middleware](#simple-cookie-management-middleware)
   - [Request Duration Logging](#request-duration-logging)
7. [CLI Extended Documentation](#7-cli-extended-documentation)
   - [Advanced CLI Options](#advanced-cli-options)
   - [Complex CLI Scenarios](#complex-cli-scenarios)
8. [Do's and Don'ts](#8-dos-and-donts)
9. [Requirements and Limitations](#9-requirements-and-limitations)
10. [Contributing and License](#10-contributing-and-license)
11. [Conclusion](#11-conclusion)

---

## 1. Introduction

Getzy is a lightweight, promise-based HTTP/HTTPS client for Node.js that uses native modules. This extended documentation explores its advanced capabilities, detailed middleware integration, and diverse usage scenarios.

---

## 2. Extended Overview

Beyond the core features listed in the README, Getzy offers:
- Granular control over retries, redirects, and timeouts.
- Customizable middleware workflows to intercept requests and responses.
- Flexible error handling that supports advanced debugging and logging scenarios.

---

## 3. Architecture and Design Details

### Internal Workflow

When a request is made:
- **Pre-processing:** The client builds the URL with query parameters and executes "before" middleware.
- **Execution:** It then makes the actual HTTP/HTTPS call with support for retries and redirects.
- **Post-processing:** Finally, "after" middleware is applied to the result before returning it.

### Middleware Phases

- **Before Middleware:**  
  Modify the request context (headers, URL, body, etc.) prior to sending.
  
- **After Middleware:**  
  Process and modify the response or log details after receiving it.

---

## 4. Deep Dive into API & Request Options

### HTTP Methods and Their Nuances

All HTTP methods (GET, POST, PUT, DELETE, etc.) are implemented as class methods. Each method adheres to the following rules:
- They accept a URL and an optional options object.
- The options object is merged with default settings, ensuring consistent behavior.
- Methods return Promises, making them easily integrable with async/await.

### Advanced Request Options

You can fine-tune behavior via the options object:
- **Timeouts, Retries, and Redirects:**  
  Fine control over these parameters can help in unstable network conditions.
- **Body Handling:**  
  Only JSON or string bodies are supported; streaming is not allowed.
- **Query Parameters:**  
  Automatically appended to URLs using URLSearchParams for proper encoding.

Example:
```js
const res = await client.put('https://api.example.com/update', {
  headers: { 'Content-Type': 'application/json' },
  body: { update: true },
  timeout: 7000,
  redirects: 2,
  retries: 3,
  baseRetryDelay: 400,
  maxRetryDelay: 1600,
  params: { userId: 'abc123' },
});
```

---

## 5. In-Depth Middleware & Integrations

### Before vs. After Middleware

- **Before Middleware:**  
  Ideal for tasks like:
  - Adding custom headers.
  - Injecting authentication tokens.
  - Modifying or logging request parameters.
  
- **After Middleware:**  
  Useful for:
  - Logging response status and time.
  - Transforming response data.
  - Implementing caching mechanisms.

### Global Error Handling

You can register a global middleware error handler to catch and log errors occurring in any middleware:
```js
client.onMiddlewareError((err, ctx, phase) => {
  console.error(`Error in ${phase} middleware for ${ctx.url}:`, err);
});
```

---

## 6. Additional Code Examples & Use Cases

This section provides advanced code snippets that demonstrate practical middleware implementations.

### Logging Middleware

Log key details of each request and response:
```js
// Log before sending the request
client.use(async ({ ctx }) => {
  console.log(`[Request] ${ctx.method} ${ctx.url}`);
  
  return { ctx };
}, 'before');

// Log after receiving the response
client.use(async ({ ctx, result }) => {
  console.log(`[Response] ${result.statusCode} ${result.statusText}`);

  return { ctx, result };
}, 'after');
```

### Caching Middleware

A basic in-memory cache to prevent duplicate network requests:
```js
const cache = new Map();

// Before middleware to serve from cache
client.use(async ({ ctx }) => {
  if (cache.has(ctx.url)) {
    console.log('Cache hit for:', ctx.url);

    return { ctx, result: cache.get(ctx.url) };
  }

  console.log('Cache miss for:', ctx.url);

  return { ctx };
}, 'before');

// After middleware to store successful responses in cache
client.use(async ({ ctx, result }) => {
  if (result && result.ok) {
    cache.set(ctx.url, result);
  }

  return { ctx, result };
}, 'after');
```

### Basic Authentication Middleware

Automatically attach Basic Auth headers if not present:
```js
client.use(async ({ ctx }) => {
  if (!ctx.options.headers || !ctx.options.headers.Authorization) {
    const username = 'user';
    const password = 'pass';
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');

    ctx.options.headers = {
      ...ctx.options.headers,
      'Authorization': `Basic ${encoded}`,
    };
  }

  return { ctx };
}, 'before');
```

### Simple Cookie Management Middleware

A rudimentary cookie jar implementation:
```js
const cookieJar = new Map();

// Before middleware to attach cookies from the jar
client.use(async ({ ctx }) => {
  const hostname = new URL(ctx.url).hostname;

  if (cookieJar.has(hostname)) {
    const cookies = cookieJar.get(hostname);

    ctx.options.headers = {
      ...ctx.options.headers,
      'Cookie': cookies.join('; '),
    };
  }

  return { ctx };
}, 'before');

// After middleware to capture and store cookies
client.use(async ({ ctx, result }) => {
  const hostname = new URL(ctx.url).hostname;

  if (result && result.headers && result.headers['set-cookie']) {
    let setCookie = result.headers['set-cookie'];

    if (!Array.isArray(setCookie)) {
      setCookie = [setCookie];
    }

    cookieJar.set(hostname, setCookie);
  }

  return { ctx, result };
}, 'after');
```

### Request Duration Logging

Measure how long each request takes:
```js
// Mark start time before request
client.use(async ({ ctx }) => {
  ctx.meta.startTime = Date.now();

  return { ctx };
}, 'before');

// Log duration after response is received
client.use(async ({ ctx, result }) => {
  const duration = Date.now() - ctx.meta.startTime;
  console.log(`Request to ${ctx.url} completed in ${duration}ms`);

  return { ctx, result };
}, 'after');
```

---

## 7. CLI Extended Documentation

### Advanced CLI Options

While the CLI usage is similar to the library's basic options, advanced scenarios include:
- **Chaining with other CLI tools:**  
  Pipe JSON output to tools like `jq` for further processing.
- **Combining multiple headers/parameters:**  
  Use repeatable flags to build complex requests.
- **Piped input for request bodies:**  
  Seamlessly integrate with Unix pipelines.

### Complex CLI Scenarios

For example, sending a POST request with piped JSON data and additional query parameters:
```bash
cat data.json | getzy post https://api.example.com/submit -p "userId=42" -H "Content-Type:application/json" --json --pretty
```

---

## 8. Do's and Don'ts

### Do's

- **Customize defaults:**  
  Use configuration to set sensible global defaults.
- **Leverage middleware:**  
  Use before and after middleware to handle recurring tasks (logging, authentication, caching).
- **Validate inputs:**  
  Always ensure that headers, parameters, and body data are well-formatted.
- **Implement error handling:**  
  Wrap async calls in try/catch and use the global error handler for middleware issues.
- **Utilize CLI piping:**  
  Chain the CLI tool with other commands for powerful terminal workflows.

### Don'ts

- **Don't expect streaming support:**  
  Only JSON or string bodies are supported; file streams are not.
- **Don't rely on browser features:**  
  Getzy is strictly for Node.js environments.
- **Don't bypass middleware checks:**  
  Ensure every middleware function returns a valid context object.
- **Don't mix incompatible request formats:**  
  Follow the key:value (headers) and key=value (query params) formats strictly.

---

## 9. Requirements and Limitations

- **Node.js Version:**  
  Requires Node.js v10 or later for native URL and Promise support.
- **Environment:**  
  Intended solely for Node.js; it does not run in browser environments.
- **Request Body Handling:**  
  Supports only JSON and string bodies; no streaming.
- **Cookie Management:**  
  No built-in cookie management; custom middleware is required.
- **Middleware Contracts:**  
  Middleware must return an object with at least a `ctx` property; otherwise, the request fails.

---

## 10. Contributing and License

For contributions, please visit the [GitHub repository](https://github.com/Sectly/getzy). Issues, enhancements, and pull requests are welcome.  
Getzy is licensed under the BSD 3-Clause License. See the LICENSE file for details.

---

## 11. Conclusion

This extended documentation has provided an in-depth look at Getzy’s advanced features and usage scenarios. By leveraging middleware, custom configurations, and the CLI tool, developers can tailor Getzy to a wide range of HTTP client needs in Node.js.  
Happy coding!