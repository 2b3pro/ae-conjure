/**
 * AE Conjure — Prompt Templates
 * Starter templates to help users write clear, specific prompts.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.Templates = (function () {
    'use strict';

    var TEMPLATES = [
        {
            category: 'Layers',
            items: [
                { label: 'Create solid layer', prompt: 'Create a solid layer named "_" with color #FF0000, comp-sized' },
                { label: 'Create text layer', prompt: 'Create a text layer that says "_" in Arial at 72px, centered in comp' },
                { label: 'Create shape layer', prompt: 'Create a shape layer with a _ (rectangle/ellipse/star) centered in comp' },
                { label: 'Create adjustment layer', prompt: 'Create an adjustment layer at the top of the layer stack' },
                { label: 'Create null + parent', prompt: 'Create a null object named "_" and parent all selected layers to it' }
            ]
        },
        {
            category: 'Animation',
            items: [
                { label: 'Fade in', prompt: 'Animate selected layer opacity from 0% to 100% over _ seconds with ease' },
                { label: 'Scale bounce', prompt: 'Add a bouncy scale animation to selected layer from 0% to 100% over _ seconds' },
                { label: 'Slide in from left', prompt: 'Animate selected layer position sliding in from off-screen left over _ seconds' },
                { label: 'Rotate full turn', prompt: 'Rotate selected layer 360 degrees over _ seconds' },
                { label: 'Typewriter reveal', prompt: 'Create a typewriter text reveal on selected text layer over _ seconds' },
                { label: 'Stagger layers', prompt: 'Offset selected layers by _ frames each to create a stagger effect' }
            ]
        },
        {
            category: 'Effects',
            items: [
                { label: 'Gaussian Blur', prompt: 'Add Gaussian Blur to selected layer with blurriness of _ pixels' },
                { label: 'Drop Shadow', prompt: 'Add Drop Shadow to selected layer with opacity 75%, distance 5, softness 10' },
                { label: 'Glow', prompt: 'Add a Glow effect to selected layer with radius _ and intensity _' },
                { label: 'Color correction', prompt: 'Add Hue/Saturation effect to selected layer and shift hue by _ degrees' }
            ]
        },
        {
            category: 'Utility',
            items: [
                { label: 'Duplicate + offset', prompt: 'Duplicate selected layer _ times, each offset _ pixels to the right' },
                { label: 'Rename sequentially', prompt: 'Rename all layers sequentially as "_01", "_02", "_03", etc.' },
                { label: 'Trim to work area', prompt: 'Trim all layers in/out points to match the work area' },
                { label: 'Random positions', prompt: 'Scatter selected layers to random positions within the comp bounds' },
                { label: 'Center anchor points', prompt: 'Center the anchor point of all selected layers' },
                { label: 'Select all by type', prompt: 'Select all _ layers (text/shape/solid/null) in the comp' }
            ]
        }
    ];

    /**
     * Contextual hints based on comp state and user input.
     */
    var HINTS = {
        empty: [
            'Tip: Be specific \u2014 "Create a red solid named BG" works better than "make a layer"',
            'Tip: Reference layers by name \u2014 "Fade in Title over 2 seconds"',
            'Tip: Include values \u2014 "Blur at 15px" instead of "add some blur"',
            'Tip: Specify timing \u2014 "Scale from 0% to 100% over 1.5 seconds with ease"',
            'Tip: Chain actions \u2014 "Create a text layer, add a drop shadow, and fade it in"'
        ],
        hasComp: 'Your comp has {count} layer(s). Reference them by name for precise results.',
        noComp: 'Enable the Comp toggle to let AI see your layers and write smarter scripts.'
    };

    function getAll() {
        return TEMPLATES;
    }

    function getRandomHint() {
        var idx = Math.floor(Math.random() * HINTS.empty.length);
        return HINTS.empty[idx];
    }

    function getCompHint(layerCount) {
        if (layerCount > 0) {
            return HINTS.hasComp.replace('{count}', layerCount);
        }
        return HINTS.noComp;
    }

    return {
        TEMPLATES: TEMPLATES,
        HINTS: HINTS,
        getAll: getAll,
        getRandomHint: getRandomHint,
        getCompHint: getCompHint
    };
})();
