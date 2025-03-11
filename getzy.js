// @Name: Getzy
// @Description: A tiny yet capable HTTP/HTTPS client for Node.js. Native. Promise-based. Pluggable.
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

/**
 * @typedef {Object} GetzyRequestOptions
 * @property {Object} [headers] - Optional headers
 * @property {Object|string} [body] - Optional request body
 * @property {number} [timeout] - Request timeout in ms
 * @property {number} [redirects] - Max redirects to follow
 * @property {number} [retries] - Max retry attempts
 * @property {number} [baseRetryDelay] - Initial retry delay in ms
 * @property {number} [maxRetryDelay] - Maximum retry delay in ms
 * @property {Object} [params] - Query parameters to append to URL
 */

/**
 * @typedef {Object} GetzyResponse
 * @property {number} statusCode
 * @property {string} statusText
 * @property {Object} headers
 * @property {any} body
 * @property {boolean} ok
 * @property {number} retries
 * @property {number} redirects
 * @property {Object} meta
 */

/**
 * @typedef {Object} GetzyContext
 * @property {string} method
 * @property {string} url
 * @property {GetzyRequestOptions} options
 * @property {Object} meta
 */

/**
 * @typedef {Object} MiddlewareInput
 * @property {GetzyContext} ctx
 * @property {GetzyResponse} [result]
 */

/**
 * @typedef {Object} MiddlewareResult
 * @property {GetzyContext} ctx
 * @property {GetzyResponse} [result]
 */

/**
 * @typedef {Object} GetzyIntegration
 * @property {(input: MiddlewareInput) => Promise<MiddlewareResult>} [before]
 * @property {(input: MiddlewareInput) => Promise<MiddlewareResult>} [after]
 */

const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');
const { STATUS_CODES } = http;

/**
 * Getzy is a lightweight HTTP client with native modules, async/await, retry, redirect,
 * middleware, and plugin (integration) support.
 */
class Getzy {
    /**
     * Create a new Getzy instance.
     * @param {Object} [config] - Optional configuration object
     * @param {Object} [config.defaultHeaders] - Default headers for every request
     * @param {number} [config.defaultMaxRedirects] - Default max redirects
     * @param {number} [config.defaultMaxRetryDelay] - Default maximum retry delay in ms
     * @param {number} [config.defaultTimeout] - Default request timeout in ms
     * @param {number} [config.defaultRetries] - Default number of retry attempts
     * @param {number} [config.defaultBaseRetryDelay] - Default initial retry delay in ms
     */
    constructor(config = {}) {
        // Configuration Flexibility with Validation and Defaults
        if (config.defaultHeaders && typeof config.defaultHeaders !== 'object') {
            throw new Error('defaultHeaders must be an object');
        }

        this.defaultHeaders = config.defaultHeaders || { 'Accept': 'application/json' };

        if (config.defaultMaxRedirects !== undefined && !Number.isInteger(config.defaultMaxRedirects)) {
            throw new Error('defaultMaxRedirects must be an integer');
        }

        this.defaultMaxRedirects = config.defaultMaxRedirects !== undefined ? config.defaultMaxRedirects : 3;

        if (config.defaultMaxRetryDelay !== undefined && !Number.isInteger(config.defaultMaxRetryDelay)) {
            throw new Error('defaultMaxRetryDelay must be an integer');
        }

        this.defaultMaxRetryDelay = config.defaultMaxRetryDelay !== undefined ? config.defaultMaxRetryDelay : 2000;

        if (config.defaultTimeout !== undefined && !Number.isInteger(config.defaultTimeout)) {
            throw new Error('defaultTimeout must be an integer');
        }

        this.defaultTimeout = config.defaultTimeout !== undefined ? config.defaultTimeout : 10000;

        if (config.defaultRetries !== undefined && !Number.isInteger(config.defaultRetries)) {
            throw new Error('defaultRetries must be an integer');
        }

        this.defaultRetries = config.defaultRetries !== undefined ? config.defaultRetries : 0;

        if (config.defaultBaseRetryDelay !== undefined && !Number.isInteger(config.defaultBaseRetryDelay)) {
            throw new Error('defaultBaseRetryDelay must be an integer');
        }

        this.defaultBaseRetryDelay = config.defaultBaseRetryDelay !== undefined ? config.defaultBaseRetryDelay : 500;
        this.middlewares = { before: [], after: [] };
        this.middlewareErrorHandler = null;
    }

    /**
     * Register a middleware for a specific phase.
     * @param {(input: MiddlewareInput) => Promise<MiddlewareResult>} fn
     * @param {'before' | 'after'} [phase='before']
     */
    use(fn, phase = 'before') {
        if (typeof fn !== 'function' || (phase !== 'before' && phase !== 'after')) {
            throw new Error('Middleware must be a function and phase must be either "before" or "after"');
        }

        this.middlewares[phase].push(fn);
    }

    /**
     * Register an integration (plugin) that includes before/after middleware.
     * @param {GetzyIntegration} integration
     */
    useIntegration(integration) {
        if (integration.before) this.use(integration.before, 'before');
        if (integration.after) this.use(integration.after, 'after');
    }

    /**
     * Provide a global handler for middleware errors.
     * @param {(err: Error, ctx: GetzyContext, phase: 'before' | 'after') => void} fn
     */
    onMiddlewareError(fn) {
        if (typeof fn !== 'function') {
            throw new Error('Middleware error handler must be a function');
        }

        this.middlewareErrorHandler = fn;
    }

    async get(url, options = {}) { return this._request('GET', url, options); }
    async post(url, options = {}) { return this._request('POST', url, options); }
    async put(url, options = {}) { return this._request('PUT', url, options); }
    async delete(url, options = {}) { return this._request('DELETE', url, options); }
    async head(url, options = {}) { return this._request('HEAD', url, options); }
    async patch(url, options = {}) { return this._request('PATCH', url, options); }
    async options(url, options = {}) { return this._request('OPTIONS', url, options); }

    _getTransport(urlObj) {
        return urlObj.protocol === 'https:' ? https : http;
    }

    _parseBody(body) {
        try {
            return JSON.parse(body);
        } catch {
            return body;
        }
    }

    _mergeHeaders(customHeaders) {
        return { ...this.defaultHeaders, ...customHeaders };
    }

    _jitteredBackoff(baseDelay, attempt, maxDelay) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * 0.2;
        const randomOffset = (Math.random() * jitter * 2) - jitter;

        return delay + randomOffset;
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _buildURLWithParams(url, params) {
        if (!params) return url;
        const u = new URL(url);
        const searchParams = new URLSearchParams(params);
        u.search = searchParams.toString();

        return u.toString();
    }

    /**
     * Executes middleware functions for the specified phase.
     * Fails fast if middleware returns invalid data.
     * @param {'before'|'after'} phase
     * @param {GetzyContext} ctx
     * @param {GetzyResponse} [result]
     * @returns {Promise<MiddlewareResult>}
     */
    async _runMiddleware(phase, ctx, result = null) {
        let currentCtx = ctx;

        for (const mw of this.middlewares[phase]) {
            try {
                const returned = await mw({ ctx: currentCtx, result });

                if (!returned || typeof returned !== 'object' || typeof returned.ctx !== 'object') {
                    throw new Error(`Middleware must return an object with a valid 'ctx' property`);
                }

                if (returned.result !== undefined) {
                    if (typeof returned.result !== 'object') {
                        throw new Error(`Middleware returned an invalid result`);
                    }

                    return { ctx: returned.ctx, result: returned.result };
                }

                currentCtx = returned.ctx;
            } catch (err) {
                if (this.middlewareErrorHandler) {
                    await this.middlewareErrorHandler(err, currentCtx, phase);
                }
                // Fail the entire request if middleware fails
                throw err;
            }
        }

        return { ctx: currentCtx, result };
    }

    /**
     * Internal request handler that performs the HTTP request,
     * manages retries, redirects, and middleware chaining.
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} url - Request URL
     * @param {GetzyRequestOptions} [options] - Request options
     * @param {number} [redirectCount] - Internal: number of redirects so far
     * @param {number} [attempt] - Internal: current retry attempt
     * @returns {Promise<GetzyResponse>} Resolves with the HTTP response
     */
    async _request(method, url, options = {}, redirectCount = 0, attempt = 0) {
        const fullURL = this._buildURLWithParams(url, options.params);
        let ctx = { method, url: fullURL, options, meta: {} };

        // Run "before" middleware
        const pre = await this._runMiddleware('before', ctx);
        
        if (pre && pre.ctx) {
            ctx = pre.ctx;
        } else {
            throw new Error(`Middleware returned an invalid ctx`);
        }

        if (pre && pre.result !== undefined) {
            const post = await this._runMiddleware('after', ctx, pre.result);
            
            if (post && post.result) {
                return post.result;
            }
        } else {
            throw new Error(`Middleware returned an invalid output`);
        }

        const urlObj = new URL(ctx.url);
        const transport = this._getTransport(urlObj);
        const {
            headers = {},
            body = null,
            timeout = this.defaultTimeout,
            redirects = this.defaultMaxRedirects,
            retries = this.defaultRetries,
            maxRetryDelay = this.defaultMaxRetryDelay,
            baseRetryDelay = this.defaultBaseRetryDelay,
        } = ctx.options;

        const finalHeaders = this._mergeHeaders(headers);
        const requestOptions = {
            method: ctx.method,
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: finalHeaders,
            timeout,
        };

        return new Promise((resolve, reject) => {
            const req = transport.request(requestOptions, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);

                res.on('end', async () => {
                    // Minimal cleanup
                    res.removeAllListeners();

                    const isRedirect = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
                    const isServerError = res.statusCode >= 500;

                    if (isRedirect && redirectCount < redirects) {
                        const nextUrl = new URL(res.headers.location, ctx.url).toString();

                        try {
                            const redirected = await this._request(ctx.method, nextUrl, ctx.options, redirectCount + 1, attempt);
                            redirected.redirects = redirectCount + 1;

                            const post = await this._runMiddleware('after', ctx, redirected);

                            return resolve(post.result);
                        } catch (e) {
                            return reject(e);
                        }
                    }

                    const contentType = res.headers['content-type'] || '';
                    const isJSON = contentType.includes('application/json');
                    const result = {
                        statusCode: res.statusCode,
                        statusText: STATUS_CODES[res.statusCode] || '',
                        headers: res.headers,
                        body: isJSON ? this._parseBody(data) : data,
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        retries: attempt,
                        redirects: redirectCount,
                        meta: ctx.meta
                    };

                    if (result.ok) {
                        const post = await this._runMiddleware('after', ctx, result);

                        return resolve(post.result);
                    }

                    if (isServerError && attempt < retries) {
                        const delayMs = this._jitteredBackoff(baseRetryDelay, attempt, maxRetryDelay);

                        await this._delay(delayMs);

                        return resolve(await this._request(ctx.method, ctx.url, ctx.options, redirectCount, attempt + 1));
                    }

                    const err = new Error(`Request failed with status ${res.statusCode}`);
                    err.response = result;
                    err.request = { method: ctx.method, url: ctx.url, options: ctx.options, attempt };

                    return reject(err);
                });
            });

            req.on('error', async (err) => {
                if (attempt < retries) {
                    const delayMs = this._jitteredBackoff(baseRetryDelay, attempt, maxRetryDelay);

                    await this._delay(delayMs);

                    return resolve(await this._request(ctx.method, ctx.url, ctx.options, redirectCount, attempt + 1));
                }

                const networkError = new Error(`Network error: ${err.message}`);
                networkError.request = { method: ctx.method, url: ctx.url, options: ctx.options, attempt };

                reject(networkError);
            });

            req.on('timeout', () => {
                req.destroy();

                const timeoutError = new Error('Request timed out');
                timeoutError.request = { method: ctx.method, url: ctx.url, options: ctx.options, attempt };

                reject(timeoutError);
            });

            // Body handling: only support JSON/string bodies (no streaming/compression)
            if (body && ctx.method !== 'GET' && ctx.method !== 'HEAD') {
                if (typeof body === 'object' && typeof body.pipe === 'function') {
                    return reject(new Error('Streaming is not supported for body handling'));
                }

                const bodyData = typeof body === 'object' ? JSON.stringify(body) : String(body);

                if (typeof body === 'object' && !finalHeaders['Content-Type']) {
                    req.setHeader('Content-Type', 'application/json');
                }

                req.setHeader('Content-Length', Buffer.byteLength(bodyData));
                req.write(bodyData);
            }

            req.end();
        });
    }
}

module.exports = Getzy;