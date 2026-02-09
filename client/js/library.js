/**
 * AE Conjure — Script Library
 * CRUD operations for saved scripts with categories, search, and favorites.
 * Stores data in ~/ae-conjure/library.json via Node.js filesystem.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.Library = (function () {
    'use strict';

    var fs, path, os;
    try {
        fs = require('fs');
        path = require('path');
        os = require('os');
    } catch (e) {
        // Node.js modules not available — library will be disabled
    }

    var LIBRARY_DIR = os ? path.join(os.homedir(), 'ae-conjure') : '';
    var LIBRARY_FILE = LIBRARY_DIR ? path.join(LIBRARY_DIR, 'library.json') : '';

    var DEFAULT_CATEGORIES = [
        'Animation',
        'Text',
        'Shapes',
        'Effects',
        'Camera',
        'Expressions',
        'Utility',
        'Workflow',
        'Other'
    ];

    /**
     * Ensure the library directory and file exist.
     */
    function ensureLibrary() {
        if (!fs) return;
        if (!fs.existsSync(LIBRARY_DIR)) {
            fs.mkdirSync(LIBRARY_DIR, { recursive: true });
        }
        if (!fs.existsSync(LIBRARY_FILE)) {
            fs.writeFileSync(LIBRARY_FILE, JSON.stringify({ scripts: [], categories: DEFAULT_CATEGORIES }, null, 2));
        }
    }

    /**
     * Read the library from disk.
     * @returns {Object} { scripts: [], categories: [] }
     */
    function readLibrary() {
        ensureLibrary();
        if (!fs) return { scripts: [], categories: DEFAULT_CATEGORIES };
        try {
            var data = fs.readFileSync(LIBRARY_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return { scripts: [], categories: DEFAULT_CATEGORIES };
        }
    }

    /**
     * Write the library to disk.
     * @param {Object} library - The library data
     */
    function writeLibrary(library) {
        ensureLibrary();
        if (!fs) return;
        fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2));
    }

    /**
     * Generate a unique ID.
     * @returns {string}
     */
    function generateId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Save a script to the library.
     *
     * @param {Object} script
     * @param {string} script.name - Script name
     * @param {string} script.description - Brief description
     * @param {string} script.code - ExtendScript code
     * @param {string} [script.category] - Category (default: "Other")
     * @param {string[]} [script.tags] - Tags
     * @param {string} [script.prompt] - Original user prompt
     * @returns {Object} The saved script entry
     */
    function save(script) {
        var library = readLibrary();
        var entry = {
            id: generateId(),
            name: script.name || 'Untitled Script',
            description: script.description || '',
            code: script.code,
            category: script.category || 'Other',
            tags: script.tags || [],
            prompt: script.prompt || '',
            favorite: false,
            created: new Date().toISOString(),
            lastUsed: null,
            useCount: 0
        };
        library.scripts.push(entry);
        writeLibrary(library);
        return entry;
    }

    /**
     * Get all scripts, optionally filtered.
     *
     * @param {Object} [filters]
     * @param {string} [filters.category] - Filter by category
     * @param {boolean} [filters.favorite] - Filter favorites only
     * @param {string} [filters.search] - Search in name, description, tags
     * @returns {Object[]} Matching scripts
     */
    function getAll(filters) {
        var library = readLibrary();
        var scripts = library.scripts;

        if (!filters) return scripts;

        if (filters.category) {
            scripts = scripts.filter(function (s) { return s.category === filters.category; });
        }
        if (filters.favorite) {
            scripts = scripts.filter(function (s) { return s.favorite; });
        }
        if (filters.search) {
            var q = filters.search.toLowerCase();
            scripts = scripts.filter(function (s) {
                return (s.name && s.name.toLowerCase().indexOf(q) !== -1) ||
                    (s.description && s.description.toLowerCase().indexOf(q) !== -1) ||
                    (s.tags && s.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; }));
            });
        }

        return scripts;
    }

    /**
     * Get a single script by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    function getById(id) {
        var library = readLibrary();
        for (var i = 0; i < library.scripts.length; i++) {
            if (library.scripts[i].id === id) return library.scripts[i];
        }
        return null;
    }

    /**
     * Update a script entry.
     * @param {string} id
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated entry or null if not found
     */
    function update(id, updates) {
        var library = readLibrary();
        for (var i = 0; i < library.scripts.length; i++) {
            if (library.scripts[i].id === id) {
                for (var key in updates) {
                    if (updates.hasOwnProperty(key) && key !== 'id') {
                        library.scripts[i][key] = updates[key];
                    }
                }
                writeLibrary(library);
                return library.scripts[i];
            }
        }
        return null;
    }

    /**
     * Toggle favorite status.
     * @param {string} id
     * @returns {boolean|null} New favorite status, or null if not found
     */
    function toggleFavorite(id) {
        var library = readLibrary();
        for (var i = 0; i < library.scripts.length; i++) {
            if (library.scripts[i].id === id) {
                library.scripts[i].favorite = !library.scripts[i].favorite;
                writeLibrary(library);
                return library.scripts[i].favorite;
            }
        }
        return null;
    }

    /**
     * Record a script usage (increments count and updates lastUsed).
     * @param {string} id
     */
    function recordUsage(id) {
        var library = readLibrary();
        for (var i = 0; i < library.scripts.length; i++) {
            if (library.scripts[i].id === id) {
                library.scripts[i].useCount = (library.scripts[i].useCount || 0) + 1;
                library.scripts[i].lastUsed = new Date().toISOString();
                writeLibrary(library);
                return;
            }
        }
    }

    /**
     * Delete a script by ID.
     * @param {string} id
     * @returns {boolean} True if deleted
     */
    function remove(id) {
        var library = readLibrary();
        var initial = library.scripts.length;
        library.scripts = library.scripts.filter(function (s) { return s.id !== id; });
        if (library.scripts.length < initial) {
            writeLibrary(library);
            return true;
        }
        return false;
    }

    /**
     * Get all categories.
     * @returns {string[]}
     */
    function getCategories() {
        var library = readLibrary();
        return library.categories || DEFAULT_CATEGORIES;
    }

    /**
     * Add a custom category.
     * @param {string} category
     */
    function addCategory(category) {
        var library = readLibrary();
        if (!library.categories) library.categories = DEFAULT_CATEGORIES.slice();
        if (library.categories.indexOf(category) === -1) {
            library.categories.push(category);
            writeLibrary(library);
        }
    }

    /**
     * Export the entire library as JSON string.
     * @returns {string}
     */
    function exportLibrary() {
        return JSON.stringify(readLibrary(), null, 2);
    }

    /**
     * Import scripts from a JSON string (merges with existing).
     * @param {string} jsonStr
     * @returns {number} Number of scripts imported
     */
    function importLibrary(jsonStr) {
        var imported = JSON.parse(jsonStr);
        var library = readLibrary();
        var count = 0;

        if (imported.scripts && Array.isArray(imported.scripts)) {
            imported.scripts.forEach(function (script) {
                // Assign new IDs to avoid conflicts
                script.id = generateId();
                library.scripts.push(script);
                count++;
            });
        }

        writeLibrary(library);
        return count;
    }

    // Public API
    return {
        save: save,
        getAll: getAll,
        getById: getById,
        update: update,
        toggleFavorite: toggleFavorite,
        recordUsage: recordUsage,
        remove: remove,
        getCategories: getCategories,
        addCategory: addCategory,
        exportLibrary: exportLibrary,
        importLibrary: importLibrary,
        DEFAULT_CATEGORIES: DEFAULT_CATEGORIES
    };
})();
