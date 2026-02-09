/**
 * AE Conjure — Multi-Model AI Client
 * Unified interface for Claude, GPT, and Gemini APIs.
 * Uses CEP's built-in Node.js runtime for HTTP requests.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.AIClient = (function () {
    'use strict';

    // Provider configurations
    var PROVIDERS = {
        anthropic: {
            name: 'Anthropic',
            baseUrl: 'https://api.anthropic.com/v1/messages',
            models: [
                { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
                { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
                { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
            ],
            defaultModel: 'claude-sonnet-4-5-20250929'
        },
        openai: {
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1/chat/completions',
            models: [
                { id: 'gpt-5-2-codex', label: 'GPT-5.2 Codex' },
                { id: 'gpt-5.1-Codex-Max', label: 'GPT-5.1 Codex Max' },
                { id: 'gpt-4-1', label: 'GPT-4.1' }
            ],
            defaultModel: 'gpt-5-2-codex'
        },
        google: {
            name: 'Google',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
            models: [
                { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash'
        }
    };

    // ExtendScript system prompt
    var SYSTEM_PROMPT = [
        'You are an expert After Effects ExtendScript developer.',
        'You write scripts that run inside Adobe After Effects via ExtendScript (ES3-based JavaScript).',
        '',
        'CRITICAL RULES:',
        '1. Use ONLY ExtendScript ES3 syntax: var (not let/const), function expressions (not arrows), string concatenation (not template literals).',
        '2. Return EXACTLY ONE code block wrapped in ```javascript ... ```.',
        '3. Always wrap operations in try/catch for error handling.',
        '4. Use app.project.activeItem to access the active composition.',
        '5. Check that activeItem exists and is a CompItem before using it.',
        '6. Do NOT use modern JavaScript features: no let, const, =>, `template`, for...of, destructuring, spread, Promise, async/await.',
        '7. Do NOT use alert() or confirm() — return results as strings instead.',
        '8. Use standard ExtendScript APIs only. Refer to the After Effects Scripting Guide.',
        '9. Do NOT call app.beginUndoGroup() or app.endUndoGroup() — the host handles undo wrapping automatically.',
        '',
        'When composition context is provided, use it to write more precise scripts.',
        'If asked to modify specific layers, reference them by index or name from the context.'
    ].join('\n');

    // Explain code system prompt
    var EXPLAIN_PROMPT = [
        'You are an After Effects ExtendScript expert teacher.',
        'Explain the following script in plain English, step by step.',
        'Focus on: what it does, which AE objects it manipulates, and any non-obvious techniques.',
        'Keep explanations concise — 3-8 bullet points. No code in your response.',
        'Format as a numbered list.'
    ].join('\n');

    /**
     * Send a prompt to the configured AI provider.
     *
     * @param {Object} options
     * @param {string} options.prompt - User's natural language request
     * @param {string} options.provider - Provider key (anthropic/openai/google)
     * @param {string} options.model - Model ID
     * @param {string} options.apiKey - API key for the provider
     * @param {string} [options.compContext] - Optional comp introspection data
     * @param {string} [options.retryContext] - Optional error context from previous attempt
     * @returns {Promise<Object>} { success, code, rawResponse, error }
     */
    function sendPrompt(options) {
        var prompt = options.prompt;
        var provider = options.provider;
        var model = options.model;
        var apiKey = options.apiKey;
        var compContext = options.compContext || '';
        var retryContext = options.retryContext || '';
        var history = options.history || [];

        // Retrieve relevant knowledge if available
        var knowledge = '';
        if (AEConjure.Knowledge && AEConjure.Knowledge.isReady()) {
            knowledge = AEConjure.Knowledge.retrieve(options.prompt);
        }

        // Build the full user message
        var userMessage = '';
        if (knowledge) {
            userMessage += knowledge + '\n\n';
        }
        if (compContext) {
            userMessage += 'Current composition context:\n' + compContext + '\n\n';
        }
        if (retryContext) {
            userMessage += retryContext + '\n\n';
        }
        userMessage += prompt;

        switch (provider) {
            case 'anthropic':
                return sendAnthropic(userMessage, model, apiKey, history, SYSTEM_PROMPT);
            case 'openai':
                return sendOpenAI(userMessage, model, apiKey, history, SYSTEM_PROMPT);
            case 'google':
                return sendGoogle(userMessage, model, apiKey, history, SYSTEM_PROMPT);
            default:
                return Promise.reject({ success: false, error: 'Unknown provider: ' + provider });
        }
    }

    /**
     * Send request to Anthropic Claude API.
     */
    function sendAnthropic(userMessage, model, apiKey, history, systemPrompt) {
        var messages = [];
        // Add conversation history
        if (history && history.length > 0) {
            history.forEach(function (turn) {
                messages.push({ role: turn.role, content: turn.content });
            });
        }
        messages.push({ role: 'user', content: userMessage });

        var body = JSON.stringify({
            model: model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages
        });

        return httpPost(
            PROVIDERS.anthropic.baseUrl,
            body,
            {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        ).then(function (response) {
            var data = JSON.parse(response);
            if (data.error) {
                return { success: false, error: data.error.message || JSON.stringify(data.error) };
            }
            var text = data.content && data.content[0] ? data.content[0].text : '';
            return { success: true, code: extractCode(text), rawResponse: text };
        });
    }

    /**
     * Send request to OpenAI API.
     */
    function sendOpenAI(userMessage, model, apiKey, history, systemPrompt) {
        var messages = [{ role: 'system', content: systemPrompt }];
        // Add conversation history
        if (history && history.length > 0) {
            history.forEach(function (turn) {
                messages.push({ role: turn.role, content: turn.content });
            });
        }
        messages.push({ role: 'user', content: userMessage });

        var body = JSON.stringify({
            model: model,
            max_tokens: 4096,
            messages: messages
        });

        return httpPost(
            PROVIDERS.openai.baseUrl,
            body,
            {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            }
        ).then(function (response) {
            var data = JSON.parse(response);
            if (data.error) {
                return { success: false, error: data.error.message || JSON.stringify(data.error) };
            }
            var text = data.choices && data.choices[0] ? data.choices[0].message.content : '';
            return { success: true, code: extractCode(text), rawResponse: text };
        });
    }

    /**
     * Send request to Google Gemini API.
     */
    function sendGoogle(userMessage, model, apiKey, history, systemPrompt) {
        var url = PROVIDERS.google.baseUrl + model + ':generateContent?key=' + apiKey;

        var contents = [];
        // Add conversation history
        if (history && history.length > 0) {
            history.forEach(function (turn) {
                contents.push({
                    role: turn.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: turn.content }]
                });
            });
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        var body = JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: contents,
            generationConfig: { maxOutputTokens: 4096 }
        });

        return httpPost(
            url,
            body,
            { 'Content-Type': 'application/json' }
        ).then(function (response) {
            var data = JSON.parse(response);
            if (data.error) {
                return { success: false, error: data.error.message || JSON.stringify(data.error) };
            }
            var text = '';
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                text = data.candidates[0].content.parts[0].text;
            }
            return { success: true, code: extractCode(text), rawResponse: text };
        });
    }

    /**
     * Extract code from a markdown code block in the AI response.
     *
     * @param {string} text - Raw AI response
     * @returns {string} Extracted code, or empty string
     */
    function extractCode(text) {
        // Match ```javascript ... ``` or ``` ... ```
        var match = text.match(/```(?:javascript|jsx|extendscript)?\s*\n?([\s\S]*?)```/);
        if (match && match[1]) {
            return match[1].trim();
        }
        // Fallback: if no code fence, check if the whole response looks like code
        if (text.indexOf('app.project') !== -1 || text.indexOf('var ') !== -1) {
            return text.trim();
        }
        return '';
    }

    /**
     * HTTP POST using CEP's Node.js runtime.
     * Falls back to XMLHttpRequest if Node.js is unavailable.
     *
     * @param {string} url - Request URL
     * @param {string} body - Request body (JSON string)
     * @param {Object} headers - Request headers
     * @returns {Promise<string>} Response body
     */
    function httpPost(url, body, headers) {
        // Try Node.js https module first (available in CEP)
        try {
            if (typeof require !== 'undefined') {
                return nodeHttpPost(url, body, headers);
            }
        } catch (e) {
            // Fall through to XHR
        }

        // Fallback to XMLHttpRequest
        return xhrPost(url, body, headers);
    }

    /**
     * Node.js HTTPS POST (CEP runtime).
     */
    function nodeHttpPost(url, body, headers) {
        return new Promise(function (resolve, reject) {
            var https = require('https');
            var urlModule = require('url');
            var parsed = urlModule.parse(url);

            var options = {
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.path,
                method: 'POST',
                headers: headers
            };
            options.headers['Content-Length'] = Buffer.byteLength(body);

            var req = https.request(options, function (res) {
                var chunks = [];
                res.on('data', function (chunk) { chunks.push(chunk); });
                res.on('end', function () {
                    var responseBody = Buffer.concat(chunks).toString();
                    if (res.statusCode >= 400) {
                        reject('HTTP ' + res.statusCode + ': ' + responseBody);
                    } else {
                        resolve(responseBody);
                    }
                });
            });

            req.on('error', function (e) { reject(e.message); });
            req.write(body);
            req.end();
        });
    }

    /**
     * XMLHttpRequest POST fallback.
     */
    function xhrPost(url, body, headers) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            for (var key in headers) {
                if (headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, headers[key]);
                }
            }
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject('HTTP ' + xhr.status + ': ' + xhr.responseText);
                }
            };
            xhr.onerror = function () { reject('Network error'); };
            xhr.send(body);
        });
    }

    // Prompt refinement system prompt
    var REFINE_PROMPT = [
        'You refine vague After Effects requests into clear, specific instructions.',
        'The user wrote a brief or unclear prompt. Rewrite it so an AI can generate precise ExtendScript.',
        '',
        'Rules:',
        '- Add specific details: layer names, durations in seconds, hex colors, pixel values, property names',
        '- If comp context is provided, reference actual layer names from it',
        '- Keep the original intent but remove all ambiguity',
        '- Return ONLY the refined prompt text. No code. No explanation. No quotes around it.'
    ].join('\n');

    /**
     * Refine a user prompt using AI to make it more specific.
     *
     * @param {Object} options
     * @param {string} options.prompt - The vague user prompt
     * @param {string} options.provider - Provider key
     * @param {string} options.model - Model ID
     * @param {string} options.apiKey - API key
     * @param {string} [options.compContext] - Comp context for layer-aware refinement
     * @returns {Promise<Object>} { success, refined, error }
     */
    function refinePrompt(options) {
        var userMessage = 'Refine this After Effects request:\n\n"' + options.prompt + '"';
        if (options.compContext) {
            userMessage += '\n\nComposition context:\n' + options.compContext;
        }

        var provider = options.provider;
        var model = options.model;
        var apiKey = options.apiKey;

        var promise;
        switch (provider) {
            case 'anthropic':
                promise = sendAnthropic(userMessage, model, apiKey, [], REFINE_PROMPT);
                break;
            case 'openai':
                promise = sendOpenAI(userMessage, model, apiKey, [], REFINE_PROMPT);
                break;
            case 'google':
                promise = sendGoogle(userMessage, model, apiKey, [], REFINE_PROMPT);
                break;
            default:
                return Promise.reject({ success: false, error: 'Unknown provider' });
        }

        return promise.then(function (result) {
            if (result.success) {
                // The refined text is in rawResponse (not code)
                var refined = result.rawResponse || '';
                // Strip any accidental code fences
                refined = refined.replace(/```[\s\S]*?```/g, '').trim();
                // Strip surrounding quotes if the AI wrapped it
                refined = refined.replace(/^["']|["']$/g, '').trim();
                return { success: true, refined: refined };
            }
            return { success: false, error: result.error };
        }).catch(function (err) {
            return { success: false, error: typeof err === 'string' ? err : (err.message || 'Refine failed') };
        });
    }

    /**
     * Explain a code snippet using AI.
     *
     * @param {Object} options
     * @param {string} options.code - The code to explain
     * @param {string} options.provider - Provider key
     * @param {string} options.model - Model ID
     * @param {string} options.apiKey - API key
     * @returns {Promise<Object>} { success, rawResponse, error }
     */
    function explainCode(options) {
        var userMessage = 'Explain this ExtendScript:\n\n```javascript\n' + options.code + '\n```';

        var provider = options.provider;
        var model = options.model;
        var apiKey = options.apiKey;

        var promise;
        switch (provider) {
            case 'anthropic':
                promise = sendAnthropic(userMessage, model, apiKey, [], EXPLAIN_PROMPT);
                break;
            case 'openai':
                promise = sendOpenAI(userMessage, model, apiKey, [], EXPLAIN_PROMPT);
                break;
            case 'google':
                promise = sendGoogle(userMessage, model, apiKey, [], EXPLAIN_PROMPT);
                break;
            default:
                return Promise.reject({ success: false, error: 'Unknown provider' });
        }

        return promise.then(function (result) {
            if (result.success) {
                return { success: true, rawResponse: result.rawResponse };
            }
            return { success: false, error: result.error };
        }).catch(function (err) {
            return { success: false, error: typeof err === 'string' ? err : (err.message || 'Explain failed') };
        });
    }

    // Public API
    return {
        PROVIDERS: PROVIDERS,
        SYSTEM_PROMPT: SYSTEM_PROMPT,
        sendPrompt: sendPrompt,
        refinePrompt: refinePrompt,
        explainCode: explainCode,
        extractCode: extractCode
    };
})();
