/**
 * AE Conjure — Host Script Entry Point
 * Routes function calls from the CEP panel to ExtendScript functions.
 *
 * @version 1.0.0
 */

// Load sub-scripts
//@include "introspect.jsx"
//@include "execute.jsx"

/**
 * Simple ping to verify the host connection is alive.
 * @returns {string} JSON success response
 */
function ping() {
    return JSON.stringify({ success: true, version: "1.3.0" });
}

/**
 * Undo the last action in After Effects.
 * @returns {string} JSON success/error response
 */
function undoLast() {
    try {
        app.executeCommand(16); // Edit > Undo
        return JSON.stringify({ success: true });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
}
