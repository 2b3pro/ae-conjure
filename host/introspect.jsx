/**
 * AE Conjure — Composition Introspection
 * Reads active composition structure and returns JSON for AI context.
 *
 * @version 1.0.0
 */

/**
 * Get detailed information about the active composition.
 * Returns JSON with comp properties, all layers, and selection state.
 *
 * @returns {string} JSON string with comp data, or error JSON
 */
function introspectComp() {
    try {
        var comp = app.project.activeItem;

        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({
                success: false,
                error: "No active composition. Please open a composition first."
            });
        }

        var layers = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            layers.push(getLayerInfo(layer));
        }

        var selectedLayers = [];
        if (comp.selectedLayers) {
            for (var j = 0; j < comp.selectedLayers.length; j++) {
                selectedLayers.push(comp.selectedLayers[j].index);
            }
        }

        var result = {
            success: true,
            comp: {
                name: comp.name,
                width: comp.width,
                height: comp.height,
                duration: comp.duration,
                frameRate: comp.frameRate,
                numLayers: comp.numLayers,
                workAreaStart: comp.workAreaStart,
                workAreaDuration: comp.workAreaDuration,
                currentTime: comp.time
            },
            selectedLayerIndices: selectedLayers,
            layers: layers
        };

        return JSON.stringify(result);

    } catch (e) {
        return JSON.stringify({
            success: false,
            error: "Introspection failed: " + e.toString()
        });
    }
}

/**
 * Extract information from a single layer.
 *
 * @param {Layer} layer - An After Effects layer
 * @returns {Object} Layer info object
 */
function getLayerInfo(layer) {
    var info = {
        index: layer.index,
        name: layer.name,
        type: getLayerType(layer),
        enabled: layer.enabled,
        solo: layer.solo,
        shy: layer.shy,
        locked: layer.locked,
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
        startTime: layer.startTime,
        selected: layer.selected,
        label: layer.label,
        hasVideo: layer.hasVideo,
        hasAudio: layer.hasAudio,
        threeDLayer: layer.threeDLayer,
        effectsCount: layer.property("ADBE Effect Parade") ? layer.property("ADBE Effect Parade").numProperties : 0
    };

    // Add type-specific details
    if (layer instanceof TextLayer) {
        try {
            var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
            var textDoc = textProp.value;
            info.text = textDoc.text;
            info.fontSize = textDoc.fontSize;
            info.font = textDoc.font;
        } catch (e) {
            // Text properties not accessible
        }
    }

    if (layer instanceof ShapeLayer) {
        info.shapeGroupCount = layer.property("ADBE Root Vectors Group") ?
            layer.property("ADBE Root Vectors Group").numProperties : 0;
    }

    // List effect names
    if (info.effectsCount > 0) {
        var effects = [];
        var effectGroup = layer.property("ADBE Effect Parade");
        for (var k = 1; k <= effectGroup.numProperties; k++) {
            effects.push(effectGroup.property(k).name);
        }
        info.effects = effects;
    }

    return info;
}

/**
 * Determine the type of an After Effects layer.
 *
 * @param {Layer} layer - An After Effects layer
 * @returns {string} Layer type identifier
 */
function getLayerType(layer) {
    if (layer instanceof TextLayer) return "text";
    if (layer instanceof ShapeLayer) return "shape";
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer) return "light";
    if (layer.nullLayer) return "null";
    if (layer.adjustmentLayer) return "adjustment";
    if (layer.source instanceof CompItem) return "precomp";
    if (layer instanceof AVLayer) return "av";
    return "unknown";
}

/**
 * Get a compact summary of the active comp (for system prompts).
 * Less detailed than introspectComp — meant to fit in AI context windows.
 *
 * @returns {string} Human-readable comp summary
 */
function getCompSummary() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return "No active composition.";
        }

        var summary = "Comp: \"" + comp.name + "\" (" + comp.width + "x" + comp.height + ", " +
            comp.frameRate + "fps, " + comp.duration.toFixed(2) + "s)\n";
        summary += "Layers (" + comp.numLayers + "):\n";

        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            var sel = layer.selected ? " [SELECTED]" : "";
            var type = getLayerType(layer);
            summary += "  " + i + ". " + type + ": \"" + layer.name + "\"" + sel + "\n";
        }

        if (comp.selectedLayers.length > 0) {
            summary += "\nSelected: " + comp.selectedLayers.length + " layer(s)";
        }

        return summary;

    } catch (e) {
        return "Error reading composition: " + e.toString();
    }
}
