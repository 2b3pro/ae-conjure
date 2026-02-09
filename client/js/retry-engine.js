/**
 * AE Conjure — Auto-Retry Engine
 * Generates code, executes in AE, and retries with error feedback on failure.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.RetryEngine = (function () {
    'use strict';

    var DEFAULT_MAX_RETRIES = 3;

    /**
     * Run the full generate → execute → retry loop.
     *
     * @param {Object} options
     * @param {string} options.prompt - User's natural language request
     * @param {string} options.provider - AI provider key
     * @param {string} options.model - Model ID
     * @param {string} options.apiKey - API key
     * @param {string} [options.compContext] - Composition context string
     * @param {number} [options.maxRetries] - Max retry attempts (default: 3)
     * @param {Function} [options.onAttempt] - Callback for each attempt: (attemptNum, totalAttempts, status)
     * @param {Function} [options.onCode] - Callback when code is generated: (code, attemptNum)
     * @returns {Promise<Object>} Final result with all attempts
     */
    function run(options) {
        var maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
        var attempts = [];
        var csInterface = new CSInterface();

        return executeAttempt(0);

        function executeAttempt(attemptIndex) {
            var attemptNum = attemptIndex + 1;
            var isRetry = attemptIndex > 0;

            // Notify progress
            if (options.onAttempt) {
                options.onAttempt(attemptNum, maxRetries, isRetry ? 'retrying' : 'generating');
            }

            // Build retry context if this is a retry
            var retryContext = '';
            if (isRetry) {
                var lastAttempt = attempts[attempts.length - 1];
                retryContext = buildRetryPrompt(
                    options.prompt,
                    lastAttempt.code,
                    lastAttempt.error
                );
            }

            // Generate code via AI
            return AEConjure.AIClient.sendPrompt({
                prompt: isRetry ? retryContext : options.prompt,
                provider: options.provider,
                model: options.model,
                apiKey: options.apiKey,
                compContext: options.compContext
            }).then(function (aiResult) {
                if (!aiResult.success) {
                    attempts.push({
                        attempt: attemptNum,
                        code: '',
                        aiError: aiResult.error,
                        success: false,
                        error: 'AI generation failed: ' + aiResult.error
                    });
                    return buildFinalResult(attempts, false);
                }

                var code = aiResult.code;
                if (!code) {
                    attempts.push({
                        attempt: attemptNum,
                        code: '',
                        rawResponse: aiResult.rawResponse,
                        success: false,
                        error: 'AI response did not contain a code block.'
                    });
                    // Retry — the AI might produce code on next attempt with feedback
                    if (attemptNum < maxRetries) {
                        return executeAttempt(attemptIndex + 1);
                    }
                    return buildFinalResult(attempts, false);
                }

                // Notify code generated
                if (options.onCode) {
                    options.onCode(code, attemptNum);
                }

                // Execute in After Effects
                return executeInAE(csInterface, code).then(function (execResult) {
                    var attempt = {
                        attempt: attemptNum,
                        code: code,
                        rawResponse: aiResult.rawResponse,
                        success: execResult.success,
                        result: execResult.result || null,
                        error: execResult.error || null
                    };
                    attempts.push(attempt);

                    if (execResult.success) {
                        return buildFinalResult(attempts, true);
                    }

                    // Retry if under limit
                    if (attemptNum < maxRetries) {
                        return executeAttempt(attemptIndex + 1);
                    }

                    return buildFinalResult(attempts, false);
                });
            }).catch(function (err) {
                attempts.push({
                    attempt: attemptNum,
                    code: '',
                    success: false,
                    error: typeof err === 'string' ? err : (err.message || JSON.stringify(err))
                });
                return buildFinalResult(attempts, false);
            });
        }
    }

    /**
     * Execute code in After Effects via csInterface.evalScript.
     *
     * @param {CSInterface} csInterface
     * @param {string} code - ExtendScript code
     * @returns {Promise<Object>} { success, result/error }
     */
    function executeInAE(csInterface, code) {
        return new Promise(function (resolve) {
            // Escape the code for passing through evalScript
            var escapedCode = code
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');

            var script = "executeScript('" + escapedCode + "')";

            csInterface.evalScript(script, function (result) {
                if (result === 'EvalScript error.' || result === EvalScript_ErrMessage) {
                    resolve({
                        success: false,
                        error: 'ExtendScript evaluation error. The host script may not be loaded.'
                    });
                    return;
                }

                try {
                    var parsed = JSON.parse(result);
                    resolve(parsed);
                } catch (e) {
                    // If we can't parse the result, treat it as success with raw output
                    resolve({ success: true, result: result });
                }
            });
        });
    }

    /**
     * Build a retry prompt with error context.
     *
     * @param {string} originalPrompt - The original user request
     * @param {string} failedCode - The code that failed
     * @param {string} errorMessage - The error message from execution
     * @returns {string} Retry prompt
     */
    function buildRetryPrompt(originalPrompt, failedCode, errorMessage) {
        return [
            'The previous script failed with this error:',
            '',
            'ERROR: ' + errorMessage,
            '',
            'FAILED CODE:',
            '```javascript',
            failedCode,
            '```',
            '',
            'ORIGINAL REQUEST: ' + originalPrompt,
            '',
            'Please fix the script. Remember: ExtendScript uses ES3 syntax only (var, not let/const; no arrow functions; no template literals).'
        ].join('\n');
    }

    /**
     * Build the final result object with all attempts.
     */
    function buildFinalResult(attempts, success) {
        return {
            success: success,
            attempts: attempts,
            totalAttempts: attempts.length,
            finalCode: success ? attempts[attempts.length - 1].code : null,
            finalResult: success ? attempts[attempts.length - 1].result : null,
            finalError: !success ? attempts[attempts.length - 1].error : null
        };
    }

    // Public API
    return {
        run: run,
        DEFAULT_MAX_RETRIES: DEFAULT_MAX_RETRIES
    };
})();
