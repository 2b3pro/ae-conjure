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
    return JSON.stringify({ success: true, version: "1.0.0" });
}
