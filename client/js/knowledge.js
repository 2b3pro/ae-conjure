/**
 * AE Conjure — Knowledge Base
 * Retrieval engine for AE scripting API atoms, recipes, and gotchas.
 * Downloads corpus from GitHub on first use, caches locally.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.Knowledge = (function () {
    'use strict';

    var fs, path, os;
    try {
        fs = require('fs');
        path = require('path');
        os = require('os');
    } catch (e) {
        // Node.js modules not available
    }

    var KNOWLEDGE_DIR = os ? path.join(os.homedir(), 'ae-conjure') : '';
    var KNOWLEDGE_FILE = KNOWLEDGE_DIR ? path.join(KNOWLEDGE_DIR, 'knowledge.json') : '';
    var CORPUS_URL = 'https://raw.githubusercontent.com/2b3pro/ae-conjure/main/data/knowledge.json';

    var _corpus = null;
    var _ready = false;
    var _loading = false;

    /**
     * Initialize the knowledge base.
     * Downloads corpus if not cached locally.
     * @returns {Promise<boolean>} Whether the corpus is ready
     */
    function init() {
        if (_ready) return Promise.resolve(true);
        if (_loading) return Promise.resolve(false);

        // Try loading from local cache first
        if (loadFromDisk()) {
            return Promise.resolve(true);
        }

        // Download from GitHub
        return download();
    }

    /**
     * Load corpus from local cache.
     * @returns {boolean} Success
     */
    function loadFromDisk() {
        if (!fs) return false;
        try {
            if (fs.existsSync(KNOWLEDGE_FILE)) {
                var data = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
                if (data && data.atoms) {
                    _corpus = data;
                    _ready = true;
                    buildIndex();
                    return true;
                }
            }
        } catch (e) {
            console.warn('AE Conjure Knowledge: Failed to load cache:', e.message);
        }
        return false;
    }

    /**
     * Download corpus from GitHub.
     * @returns {Promise<boolean>}
     */
    function download() {
        _loading = true;

        return new Promise(function (resolve) {
            try {
                var https = require('https');
                var urlModule = require('url');
                var parsed = urlModule.parse(CORPUS_URL);

                var options = {
                    hostname: parsed.hostname,
                    path: parsed.path,
                    method: 'GET',
                    headers: { 'User-Agent': 'AE-Conjure/1.0' }
                };

                var req = https.request(options, function (res) {
                    // Follow redirects (GitHub raw sometimes 301s)
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        var redirectParsed = urlModule.parse(res.headers.location);
                        var redirectOpts = {
                            hostname: redirectParsed.hostname,
                            path: redirectParsed.path,
                            method: 'GET',
                            headers: { 'User-Agent': 'AE-Conjure/1.0' }
                        };
                        https.get(redirectOpts, handleResponse).on('error', handleError);
                        return;
                    }
                    handleResponse(res);
                });

                req.on('error', handleError);
                req.end();

            } catch (e) {
                handleError(e);
            }

            function handleResponse(res) {
                var chunks = [];
                res.on('data', function (chunk) { chunks.push(chunk); });
                res.on('end', function () {
                    _loading = false;
                    if (res.statusCode !== 200) {
                        console.warn('AE Conjure Knowledge: Download failed, status ' + res.statusCode);
                        resolve(false);
                        return;
                    }
                    try {
                        var body = Buffer.concat(chunks).toString();
                        var data = JSON.parse(body);
                        _corpus = data;
                        _ready = true;
                        buildIndex();
                        saveToDisk(body);
                        resolve(true);
                    } catch (parseErr) {
                        console.warn('AE Conjure Knowledge: Parse error:', parseErr.message);
                        resolve(false);
                    }
                });
            }

            function handleError(err) {
                _loading = false;
                console.warn('AE Conjure Knowledge: Download error:', err.message || err);
                resolve(false);
            }
        });
    }

    /**
     * Save corpus to local cache.
     * @param {string} jsonStr - Raw JSON string
     */
    function saveToDisk(jsonStr) {
        if (!fs) return;
        try {
            if (!fs.existsSync(KNOWLEDGE_DIR)) {
                fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
            }
            fs.writeFileSync(KNOWLEDGE_FILE, jsonStr);
        } catch (e) {
            console.warn('AE Conjure Knowledge: Failed to cache:', e.message);
        }
    }

    // ---- Retrieval ----

    var _index = {}; // keyword -> [chunk references]

    /**
     * Build a keyword index over the corpus for fast retrieval.
     */
    function buildIndex() {
        _index = {};
        if (!_corpus) return;

        // Index atoms
        if (_corpus.atoms) {
            _corpus.atoms.forEach(function (atom, i) {
                var keywords = [];
                keywords.push(atom.className.toLowerCase());
                if (atom.member) keywords.push(atom.member.toLowerCase());
                if (atom.tags) {
                    atom.tags.forEach(function (t) { keywords.push(t.toLowerCase()); });
                }
                keywords.forEach(function (kw) {
                    if (!_index[kw]) _index[kw] = [];
                    _index[kw].push({ type: 'atom', index: i });
                });
            });
        }

        // Index recipes
        if (_corpus.recipes) {
            _corpus.recipes.forEach(function (recipe, i) {
                var keywords = [];
                if (recipe.tags) {
                    recipe.tags.forEach(function (t) { keywords.push(t.toLowerCase()); });
                }
                // Also index words from the title
                recipe.title.toLowerCase().split(/\s+/).forEach(function (w) {
                    if (w.length > 3) keywords.push(w);
                });
                keywords.forEach(function (kw) {
                    if (!_index[kw]) _index[kw] = [];
                    _index[kw].push({ type: 'recipe', index: i });
                });
            });
        }

        // Index gotchas
        if (_corpus.gotchas) {
            _corpus.gotchas.forEach(function (gotcha, i) {
                var keywords = [];
                if (gotcha.tags) {
                    gotcha.tags.forEach(function (t) { keywords.push(t.toLowerCase()); });
                }
                gotcha.title.toLowerCase().split(/\s+/).forEach(function (w) {
                    if (w.length > 3) keywords.push(w);
                });
                keywords.forEach(function (kw) {
                    if (!_index[kw]) _index[kw] = [];
                    _index[kw].push({ type: 'gotcha', index: i });
                });
            });
        }
    }

    /**
     * Retrieve relevant knowledge chunks for a user prompt.
     * Returns formatted text to inject into the AI system prompt.
     *
     * @param {string} prompt - User's natural language request
     * @param {Object} [options] - { maxAtoms: 10, maxRecipes: 3, maxGotchas: 5 }
     * @returns {string} Formatted knowledge context, or empty string
     */
    // Common words that match too broadly in the index
    var STOP_WORDS = {
        'the': 1, 'and': 1, 'for': 1, 'that': 1, 'with': 1, 'this': 1,
        'from': 1, 'have': 1, 'all': 1, 'can': 1, 'will': 1, 'make': 1,
        'like': 1, 'just': 1, 'want': 1, 'need': 1, 'get': 1, 'set': 1,
        'use': 1, 'add': 1, 'new': 1, 'each': 1, 'how': 1, 'its': 1
    };

    // Minimum score threshold — chunks below this are noise
    var MIN_SCORE = 3;

    function retrieve(prompt, options) {
        if (!_ready || !_corpus) return '';

        options = options || {};
        var maxAtoms = options.maxAtoms || 5;
        var maxRecipes = options.maxRecipes || 2;
        var maxGotchas = options.maxGotchas || 3;

        // Extract keywords from prompt, filtering stop words
        var words = prompt.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(function (w) { return w.length > 2 && !STOP_WORDS[w]; });

        // Deduplicate keywords
        var seen = {};
        words = words.filter(function (w) {
            if (seen[w]) return false;
            seen[w] = true;
            return true;
        });

        // Score each chunk by keyword hit count
        var atomScores = {};
        var recipeScores = {};
        var gotchaScores = {};

        words.forEach(function (word) {
            // Exact match (strong signal)
            if (_index[word]) {
                _index[word].forEach(function (ref) {
                    var map = ref.type === 'atom' ? atomScores :
                              ref.type === 'recipe' ? recipeScores : gotchaScores;
                    map[ref.index] = (map[ref.index] || 0) + 3;
                });
            }
            // Partial match (prefix, weaker signal)
            for (var kw in _index) {
                if (_index.hasOwnProperty(kw) && kw.indexOf(word) === 0 && kw !== word) {
                    _index[kw].forEach(function (ref) {
                        var map = ref.type === 'atom' ? atomScores :
                                  ref.type === 'recipe' ? recipeScores : gotchaScores;
                        map[ref.index] = (map[ref.index] || 0) + 1;
                    });
                }
            }
        });

        // Sort by score and take top N, filtering below minimum score
        var topAtoms = topN(atomScores, maxAtoms, MIN_SCORE).map(function (i) { return _corpus.atoms[i]; });
        var topRecipes = topN(recipeScores, maxRecipes, MIN_SCORE).map(function (i) { return _corpus.recipes[i]; });
        var topGotchas = topN(gotchaScores, maxGotchas, MIN_SCORE).map(function (i) { return _corpus.gotchas[i]; });

        if (topAtoms.length === 0 && topRecipes.length === 0 && topGotchas.length === 0) {
            return '';
        }

        // Format for injection
        var parts = [];

        if (topAtoms.length > 0) {
            parts.push('=== API ===');
            topAtoms.forEach(function (atom) {
                var line = atom.className;
                if (atom.member) line += '.' + atom.member;
                if (atom.signature) line += atom.signature;
                if (atom.returnType) line += ' -> ' + atom.returnType;
                if (atom.description) line += ' — ' + atom.description;
                parts.push(line);
            });
        }

        if (topRecipes.length > 0) {
            parts.push('\n=== PATTERNS ===');
            topRecipes.forEach(function (recipe) {
                parts.push(recipe.title + ':\n' + recipe.code);
            });
        }

        if (topGotchas.length > 0) {
            parts.push('\n=== AVOID ===');
            topGotchas.forEach(function (gotcha) {
                parts.push('- ' + gotcha.title + ': ' + gotcha.description);
            });
        }

        return parts.join('\n');
    }

    /**
     * Get top N indices sorted by score descending, with optional minimum threshold.
     */
    function topN(scoreMap, n, minScore) {
        minScore = minScore || 0;
        return Object.keys(scoreMap)
            .filter(function (k) { return scoreMap[k] >= minScore; })
            .sort(function (a, b) { return scoreMap[b] - scoreMap[a]; })
            .slice(0, n)
            .map(function (k) { return parseInt(k, 10); });
    }

    /**
     * Check if the knowledge base is loaded and ready.
     * @returns {boolean}
     */
    function isReady() {
        return _ready;
    }

    /**
     * Get corpus stats.
     * @returns {Object|null}
     */
    function stats() {
        if (!_corpus) return null;
        return {
            atoms: _corpus.atoms ? _corpus.atoms.length : 0,
            recipes: _corpus.recipes ? _corpus.recipes.length : 0,
            gotchas: _corpus.gotchas ? _corpus.gotchas.length : 0,
            version: _corpus.version || 'unknown'
        };
    }

    /**
     * Force re-download of the corpus.
     * @returns {Promise<boolean>}
     */
    function update() {
        _ready = false;
        _corpus = null;
        _index = {};
        return download();
    }

    return {
        init: init,
        retrieve: retrieve,
        isReady: isReady,
        stats: stats,
        update: update,
        CORPUS_URL: CORPUS_URL
    };
})();
