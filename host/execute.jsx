/**
 * AE Conjure — Safe Script Execution
 * Wraps user-generated code in undo groups with error capture.
 *
 * NOTE: This file intentionally uses eval() to execute AI-generated ExtendScript code.
 * This is the core purpose of the extension — running dynamically generated scripts
 * inside After Effects. The eval is sandboxed within AE's ExtendScript engine,
 * wrapped in undo groups for safe rollback, and protected by try/catch error handling.
 *
 * @version 1.0.0
 */

/**
 * Execute an ExtendScript string safely inside an undo group.
 *
 * @param {string} code - The ExtendScript code to execute
 * @param {string} [label] - Optional undo group label (default: "AE Conjure")
 * @returns {string} JSON string with { success, result/error }
 */
function executeScript(code, label) {
    if (!label) label = "AE Conjure";

    var result;
    var success = false;
    var errorMsg = "";
    var errorLine = -1;

    try {
        app.beginUndoGroup(label);

        // eval() is intentional here — this is the core mechanism for running
        // AI-generated ExtendScript inside After Effects. The code is sandboxed
        // within AE's scripting engine and wrapped in an undo group for rollback.
        result = eval(code); // eslint-disable-line no-eval

        // Convert result to a string representation
        if (result === undefined) {
            result = "Script executed successfully (no return value).";
        } else if (typeof result === "object") {
            try {
                result = JSON.stringify(result);
            } catch (jsonErr) {
                result = result.toString();
            }
        } else {
            result = String(result);
        }

        success = true;

    } catch (e) {
        errorMsg = e.toString();

        // Extract line number if available
        if (e.line !== undefined) {
            errorLine = e.line;
        }
        // Try to get more specific error info
        if (e.message) {
            errorMsg = e.message;
        }
        if (e.source) {
            errorMsg += " (source: " + e.source + ")";
        }

    } finally {
        try {
            app.endUndoGroup();
        } catch (undoErr) {
            // Undo group may not have been started if error was in beginUndoGroup
        }
    }

    if (success) {
        return JSON.stringify({
            success: true,
            result: result
        });
    } else {
        var errObj = {
            success: false,
            error: errorMsg
        };
        if (errorLine >= 0) {
            errObj.line = errorLine;
        }
        return JSON.stringify(errObj);
    }
}
