/**
 * AE Conjure — Main Panel Orchestration
 * Wires up UI events, manages chat state, and coordinates all modules.
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    var csInterface = new CSInterface();
    var chatHistory = [];
    var isProcessing = false;

    // DOM references (set on init)
    var $chatContainer, $promptInput, $runBtn, $modelSelect, $providerSelect;
    var $settingsOverlay, $libraryOverlay;
    var $compToggle;

    /**
     * Initialize the panel.
     */
    function init() {
        // Cache DOM elements
        $chatContainer = document.getElementById('chat-container');
        $promptInput = document.getElementById('prompt-input');
        $runBtn = document.getElementById('run-btn');
        $modelSelect = document.getElementById('model-select');
        $providerSelect = document.getElementById('provider-select');
        $settingsOverlay = document.getElementById('settings-overlay');
        $libraryOverlay = document.getElementById('library-overlay');
        $compToggle = document.getElementById('comp-context-toggle');

        // Load settings and populate UI
        var settings = AEConjure.Settings.load();
        populateProviderSelect(settings.provider);
        populateModelSelect(settings.provider, settings.model);
        if ($compToggle) $compToggle.checked = settings.includeCompContext !== false;

        // Sync settings to match what the dropdowns actually show
        // (fixes stale model if stored model doesn't match current provider)
        AEConjure.Settings.set('provider', $providerSelect.value);
        AEConjure.Settings.set('model', $modelSelect.value);

        // Event listeners
        $runBtn.addEventListener('click', handleRun);
        $promptInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleRun();
            }
        });

        $providerSelect.addEventListener('change', function () {
            var provider = $providerSelect.value;
            populateModelSelect(provider);
            AEConjure.Settings.set('provider', provider);
            AEConjure.Settings.set('model', $modelSelect.value);
        });

        $modelSelect.addEventListener('change', function () {
            AEConjure.Settings.set('model', $modelSelect.value);
        });

        // Toolbar buttons
        document.getElementById('settings-btn').addEventListener('click', showSettings);
        document.getElementById('library-btn').addEventListener('click', showLibrary);

        // Settings overlay events
        document.getElementById('settings-close').addEventListener('click', hideSettings);
        document.getElementById('settings-save').addEventListener('click', saveSettings);

        // Library overlay events
        document.getElementById('library-close').addEventListener('click', hideLibrary);
        document.getElementById('library-search').addEventListener('input', refreshLibrary);
        document.getElementById('library-filter').addEventListener('change', refreshLibrary);

        // Theme sync with After Effects
        syncTheme();
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, syncTheme);

        // Verify host connection
        csInterface.evalScript('ping()', function (result) {
            if (result && result !== 'EvalScript error.') {
                addSystemMessage('Connected to After Effects. Ready to conjure scripts!');
            } else {
                addSystemMessage('Warning: Could not connect to After Effects host scripts. Some features may not work.');
            }
        });

        // Check for API key
        if (!AEConjure.Settings.hasApiKey()) {
            addSystemMessage('No API key configured. Click the gear icon to add your API key.');
        }

        // Focus input
        $promptInput.focus();
    }

    /**
     * Handle the Run button click.
     */
    function handleRun() {
        var prompt = $promptInput.value.trim();
        if (!prompt || isProcessing) return;

        // Read provider and model from the DOM dropdowns (source of truth)
        var provider = $providerSelect.value;
        var model = $modelSelect.value;
        var settings = AEConjure.Settings.load();
        var apiKey = AEConjure.Settings.getApiKey(provider);

        if (!apiKey) {
            AEConjure.UI.showToast('Please set your ' + AEConjure.AIClient.PROVIDERS[provider].name + ' API key in Settings first.', 'error');
            showSettings();
            return;
        }

        // Sync settings to match what the user sees
        AEConjure.Settings.set('provider', provider);
        AEConjure.Settings.set('model', model);

        isProcessing = true;
        $runBtn.disabled = true;
        $runBtn.textContent = 'Running...';
        $promptInput.value = '';

        // Add user message
        addMessage('user', prompt);

        // Get comp context if enabled
        var compContextPromise;
        if (settings.includeCompContext !== false) {
            compContextPromise = getCompContext();
        } else {
            compContextPromise = Promise.resolve('');
        }

        compContextPromise.then(function (compContext) {
            return AEConjure.RetryEngine.run({
                prompt: prompt,
                provider: provider,
                model: model,
                apiKey: apiKey,
                compContext: compContext,
                maxRetries: settings.maxRetries || 3,
                onAttempt: function (num, max, status) {
                    updateProgress(num, max, status);
                },
                onCode: function (code, attemptNum) {
                    // Show generated code in chat on retries
                    if (attemptNum > 1) {
                        addMessage('assistant', '```javascript\n' + code + '\n```', {
                            attempt: attemptNum,
                            maxAttempts: settings.maxRetries || 3
                        });
                    }
                }
            });
        }).then(function (result) {
            removeProgress();

            if (result.success) {
                // Show final successful response
                var lastAttempt = result.attempts[result.attempts.length - 1];
                addMessage('assistant', lastAttempt.rawResponse || '```javascript\n' + lastAttempt.code + '\n```', {
                    success: true
                });

                // Offer to save
                var savePrompt = AEConjure.UI.createSavePrompt(
                    result.finalCode,
                    prompt,
                    function (saveData) {
                        AEConjure.Library.save({
                            name: saveData.name,
                            code: saveData.code,
                            prompt: saveData.prompt,
                            description: prompt
                        });
                        AEConjure.UI.showToast('Script saved to library!', 'success');
                    }
                );
                $chatContainer.appendChild(savePrompt);
            } else {
                // Show failure with all attempts
                var errorMsg = 'Failed after ' + result.totalAttempts + ' attempt(s).';
                if (result.finalError) {
                    errorMsg += '\n\nLast error: ' + result.finalError;
                }
                addMessage('assistant', errorMsg, { error: result.finalError });

                // Show the last code if available
                var lastCode = result.attempts[result.attempts.length - 1];
                if (lastCode && lastCode.code) {
                    addMessage('assistant', '```javascript\n' + lastCode.code + '\n```');
                }
            }

            scrollToBottom();
        }).catch(function (err) {
            removeProgress();
            addMessage('assistant', 'Error: ' + (err.message || err), { error: true });
        }).then(function () {
            // .finally() equivalent for broader compatibility
            isProcessing = false;
            $runBtn.disabled = false;
            $runBtn.textContent = 'Run';
            $promptInput.focus();
        });
    }

    /**
     * Get composition context from After Effects.
     * @returns {Promise<string>}
     */
    function getCompContext() {
        return new Promise(function (resolve) {
            csInterface.evalScript('getCompSummary()', function (result) {
                if (result && result !== 'EvalScript error.') {
                    resolve(result);
                } else {
                    resolve('');
                }
            });
        });
    }

    /**
     * Add a message to the chat container.
     */
    function addMessage(role, content, meta) {
        var msg = AEConjure.UI.createMessage(role, content, meta);
        $chatContainer.appendChild(msg);
        chatHistory.push({ role: role, content: content });
        scrollToBottom();
    }

    /**
     * Add a system notification message.
     */
    function addSystemMessage(text) {
        var msg = document.createElement('div');
        msg.className = 'message message-system';
        msg.textContent = text;
        $chatContainer.appendChild(msg);
        scrollToBottom();
    }

    /**
     * Update or create progress indicator.
     */
    function updateProgress(current, max, status) {
        removeProgress();
        var progress = AEConjure.UI.createProgress(current, max, status);
        $chatContainer.appendChild(progress);
        scrollToBottom();
    }

    /**
     * Remove the progress indicator.
     */
    function removeProgress() {
        var existing = document.getElementById('progress');
        if (existing) existing.remove();
    }

    /**
     * Scroll chat to bottom.
     */
    function scrollToBottom() {
        $chatContainer.scrollTop = $chatContainer.scrollHeight;
    }

    /**
     * Populate the provider dropdown.
     */
    function populateProviderSelect(selected) {
        $providerSelect.textContent = '';
        var providers = AEConjure.AIClient.PROVIDERS;
        for (var key in providers) {
            if (providers.hasOwnProperty(key)) {
                var opt = document.createElement('option');
                opt.value = key;
                opt.textContent = providers[key].name;
                if (key === selected) opt.selected = true;
                $providerSelect.appendChild(opt);
            }
        }
    }

    /**
     * Populate the model dropdown for a provider.
     */
    function populateModelSelect(provider, selectedModel) {
        $modelSelect.textContent = '';
        var providerData = AEConjure.AIClient.PROVIDERS[provider];
        if (!providerData) return;

        providerData.models.forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            if (m.id === selectedModel || (!selectedModel && m.id === providerData.defaultModel)) {
                opt.selected = true;
            }
            $modelSelect.appendChild(opt);
        });
    }

    /**
     * Show settings overlay.
     */
    function showSettings() {
        var settings = AEConjure.Settings.load();
        document.getElementById('key-anthropic').value = settings.apiKeys.anthropic || '';
        document.getElementById('key-openai').value = settings.apiKeys.openai || '';
        document.getElementById('key-google').value = settings.apiKeys.google || '';
        document.getElementById('max-retries').value = settings.maxRetries || 3;
        $settingsOverlay.classList.add('visible');
    }

    /**
     * Hide settings overlay.
     */
    function hideSettings() {
        $settingsOverlay.classList.remove('visible');
    }

    /**
     * Save settings from the overlay form.
     */
    function saveSettings() {
        AEConjure.Settings.setApiKey('anthropic', document.getElementById('key-anthropic').value.trim());
        AEConjure.Settings.setApiKey('openai', document.getElementById('key-openai').value.trim());
        AEConjure.Settings.setApiKey('google', document.getElementById('key-google').value.trim());
        AEConjure.Settings.set('maxRetries', parseInt(document.getElementById('max-retries').value, 10) || 3);
        AEConjure.Settings.set('includeCompContext', $compToggle.checked);
        AEConjure.UI.showToast('Settings saved!', 'success');
        hideSettings();
    }

    /**
     * Show library overlay.
     */
    function showLibrary() {
        $libraryOverlay.classList.add('visible');
        refreshLibrary();
    }

    /**
     * Hide library overlay.
     */
    function hideLibrary() {
        $libraryOverlay.classList.remove('visible');
    }

    /**
     * Refresh the library list display.
     */
    function refreshLibrary() {
        var search = document.getElementById('library-search').value;
        var filter = document.getElementById('library-filter').value;

        var filters = {};
        if (search) filters.search = search;
        if (filter === 'favorites') filters.favorite = true;
        else if (filter && filter !== 'all') filters.category = filter;

        var scripts = AEConjure.Library.getAll(Object.keys(filters).length > 0 ? filters : null);

        var listContainer = document.getElementById('library-list');
        listContainer.textContent = '';

        var list = AEConjure.UI.renderLibraryList(scripts, {
            onRun: function (script) {
                hideLibrary();
                runLibraryScript(script);
            },
            onDelete: function (id) {
                AEConjure.Library.remove(id);
                refreshLibrary();
                AEConjure.UI.showToast('Script deleted.', 'info');
            },
            onFavorite: function (id) {
                AEConjure.Library.toggleFavorite(id);
                refreshLibrary();
            }
        });

        listContainer.appendChild(list);
    }

    /**
     * Run a script from the library.
     */
    function runLibraryScript(script) {
        AEConjure.Library.recordUsage(script.id);
        addMessage('user', 'Running library script: ' + script.name);

        var escapedCode = script.code
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');

        var escapedName = ('AE Conjure: ' + script.name)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .substring(0, 60);

        csInterface.evalScript("executeScript('" + escapedCode + "', '" + escapedName + "')", function (result) {
            try {
                var parsed = JSON.parse(result);
                if (parsed.success) {
                    addMessage('assistant', 'Script executed successfully.' + (parsed.result ? '\nResult: ' + parsed.result : ''), { success: true });
                } else {
                    addMessage('assistant', 'Script failed: ' + parsed.error, { error: parsed.error });
                }
            } catch (e) {
                addMessage('assistant', 'Result: ' + result);
            }
        });
    }

    /**
     * Sync panel theme with After Effects.
     */
    function syncTheme() {
        try {
            var skinInfo = csInterface.getHostEnvironment().appSkinInfo;
            var bgColor = skinInfo.panelBackgroundColor.color;
            var r = Math.round(bgColor.red);
            var g = Math.round(bgColor.green);
            var b = Math.round(bgColor.blue);
            document.documentElement.style.setProperty('--ae-bg', 'rgb(' + r + ',' + g + ',' + b + ')');

            // Determine if light or dark theme
            var brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness > 128) {
                document.body.classList.add('theme-light');
                document.body.classList.remove('theme-dark');
            } else {
                document.body.classList.add('theme-dark');
                document.body.classList.remove('theme-light');
            }
        } catch (e) {
            // Not running in AE — use default dark theme
            document.body.classList.add('theme-dark');
        }
    }

    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
