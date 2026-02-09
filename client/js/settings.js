/**
 * AE Conjure — Settings Manager
 * Manages API keys, model selection, and user preferences.
 * Persists settings to ~/ae-conjure/settings.json via Node.js filesystem.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.Settings = (function () {
    'use strict';

    var fs, path, os;
    try {
        fs = require('fs');
        path = require('path');
        os = require('os');
    } catch (e) {
        // Node.js modules not available
    }

    var SETTINGS_DIR = os ? path.join(os.homedir(), 'ae-conjure') : '';
    var SETTINGS_FILE = SETTINGS_DIR ? path.join(SETTINGS_DIR, 'settings.json') : '';

    var DEFAULTS = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        maxRetries: 3,
        includeCompContext: true,
        apiKeys: {
            anthropic: '',
            openai: '',
            google: ''
        }
    };

    var _cache = null;

    /**
     * Load settings from disk, merging with defaults.
     * @returns {Object} Settings object
     */
    function load() {
        if (_cache) return _cache;

        var settings = JSON.parse(JSON.stringify(DEFAULTS)); // deep clone defaults

        if (!fs) return settings;

        try {
            if (!fs.existsSync(SETTINGS_DIR)) {
                fs.mkdirSync(SETTINGS_DIR, { recursive: true });
            }
            if (fs.existsSync(SETTINGS_FILE)) {
                var data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
                // Merge saved settings with defaults
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        if (key === 'apiKeys' && typeof data[key] === 'object') {
                            for (var provider in data[key]) {
                                if (data[key].hasOwnProperty(provider)) {
                                    settings.apiKeys[provider] = data[key][provider];
                                }
                            }
                        } else {
                            settings[key] = data[key];
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('AE Conjure: Failed to load settings:', e.message);
        }

        _cache = settings;
        return settings;
    }

    /**
     * Save settings to disk.
     * @param {Object} settings
     */
    function save(settings) {
        _cache = settings;
        if (!fs) return;

        try {
            if (!fs.existsSync(SETTINGS_DIR)) {
                fs.mkdirSync(SETTINGS_DIR, { recursive: true });
            }
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error('AE Conjure: Failed to save settings:', e.message);
        }
    }

    /**
     * Get a single setting value.
     * @param {string} key
     * @returns {*}
     */
    function get(key) {
        var settings = load();
        return settings[key];
    }

    /**
     * Set a single setting value and persist.
     * @param {string} key
     * @param {*} value
     */
    function set(key, value) {
        var settings = load();
        settings[key] = value;
        save(settings);
    }

    /**
     * Get the API key for the current or specified provider.
     * @param {string} [provider] - Provider key (defaults to current)
     * @returns {string}
     */
    function getApiKey(provider) {
        var settings = load();
        provider = provider || settings.provider;
        return (settings.apiKeys && settings.apiKeys[provider]) || '';
    }

    /**
     * Set an API key for a provider.
     * @param {string} provider
     * @param {string} key
     */
    function setApiKey(provider, key) {
        var settings = load();
        if (!settings.apiKeys) settings.apiKeys = {};
        settings.apiKeys[provider] = key;
        save(settings);
    }

    /**
     * Check if the current provider has an API key configured.
     * @returns {boolean}
     */
    function hasApiKey() {
        return getApiKey().length > 0;
    }

    /**
     * Get current provider and model selection.
     * @returns {{ provider: string, model: string }}
     */
    function getModelSelection() {
        var settings = load();
        return {
            provider: settings.provider,
            model: settings.model
        };
    }

    /**
     * Set provider and model.
     * @param {string} provider
     * @param {string} model
     */
    function setModelSelection(provider, model) {
        var settings = load();
        settings.provider = provider;
        settings.model = model;
        save(settings);
    }

    /**
     * Reset to defaults.
     */
    function reset() {
        _cache = null;
        save(JSON.parse(JSON.stringify(DEFAULTS)));
    }

    // Public API
    return {
        load: load,
        save: save,
        get: get,
        set: set,
        getApiKey: getApiKey,
        setApiKey: setApiKey,
        hasApiKey: hasApiKey,
        getModelSelection: getModelSelection,
        setModelSelection: setModelSelection,
        reset: reset,
        DEFAULTS: DEFAULTS
    };
})();
