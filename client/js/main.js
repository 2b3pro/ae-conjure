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
    var $compToggle, $templatePopover, $inputHints, $refineBtn, $templateBtn;
    var $contextPreview, $contextText, $contextToggle, $contextDetail, $contextDetailText;
    var $onboarding;

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
        $templatePopover = document.getElementById('template-popover');
        $inputHints = document.getElementById('input-hints');
        $refineBtn = document.getElementById('refine-btn');
        $templateBtn = document.getElementById('template-btn');
        $contextPreview = document.getElementById('context-preview');
        $contextText = document.getElementById('context-text');
        $contextToggle = document.getElementById('context-toggle');
        $contextDetail = document.getElementById('context-detail');
        $contextDetailText = document.getElementById('context-detail-text');
        $onboarding = document.getElementById('onboarding');

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

        // Template popover
        $templateBtn.addEventListener('click', toggleTemplates);
        buildTemplatePopover();

        // Refine button
        $refineBtn.addEventListener('click', handleRefine);

        // Context preview toggle
        if ($contextPreview) {
            $contextPreview.addEventListener('click', function () {
                $contextDetail.classList.toggle('visible');
                $contextToggle.textContent = $contextDetail.classList.contains('visible') ? '\u25BC' : '\u25B6';
            });
        }
        if ($compToggle) {
            $compToggle.addEventListener('change', function () {
                updateContextPreview();
            });
        }

        // Build onboarding
        buildOnboarding();

        // Show initial hint
        updateHint();
        $promptInput.addEventListener('focus', function () {
            updateHint();
            updateContextPreview();
        });

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

        // Initialize knowledge base (downloads on first run)
        if (AEConjure.Knowledge) {
            AEConjure.Knowledge.init().then(function (ready) {
                if (ready) {
                    var kb = AEConjure.Knowledge.stats();
                    addSystemMessage('Knowledge base loaded: ' + kb.atoms + ' API refs, ' + kb.recipes + ' patterns, ' + kb.gotchas + ' gotchas (v' + kb.version + ')');
                }
            });
        }

        // Initial context preview update
        updateContextPreview();

        // Focus input
        $promptInput.focus();
    }

    /**
     * Handle the Run button click.
     */
    function handleRun() {
        var prompt = $promptInput.value.trim();
        if (!prompt || isProcessing) return;

        // Check for chat commands
        if (prompt.charAt(0) === '/') {
            $promptInput.value = '';
            handleCommand(prompt);
            return;
        }

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
        hideOnboarding();

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
                history: buildConversationHistory(settings.conversationTurns),
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
                }, { onExplain: handleExplain });

                // Offer to save + undo
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
                    },
                    handleUndo
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
                    addMessage('assistant', '```javascript\n' + lastCode.code + '\n```',
                        null, { onExplain: handleExplain });
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
    function addMessage(role, content, meta, callbacks) {
        hideOnboarding();
        var msg = AEConjure.UI.createMessage(role, content, meta, callbacks);
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
        document.getElementById('conversation-turns').value = settings.conversationTurns || 6;
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
        AEConjure.Settings.set('conversationTurns', parseInt(document.getElementById('conversation-turns').value, 10) || 6);
        AEConjure.Settings.set('includeCompContext', $compToggle.checked);
        AEConjure.UI.showToast('Settings saved!', 'success');
        hideSettings();
        updateOnboardingStep();
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

    // ---- Templates ----

    /**
     * Toggle the template popover visibility.
     */
    function toggleTemplates() {
        $templatePopover.classList.toggle('visible');
    }

    /**
     * Build the template popover DOM from AEConjure.Templates.
     */
    function buildTemplatePopover() {
        $templatePopover.textContent = '';
        var categories = AEConjure.Templates.getAll();

        categories.forEach(function (cat) {
            var catLabel = document.createElement('div');
            catLabel.className = 'template-category';
            catLabel.textContent = cat.category;
            $templatePopover.appendChild(catLabel);

            cat.items.forEach(function (tmpl) {
                var item = document.createElement('div');
                item.className = 'template-item';

                var name = document.createElement('div');
                name.textContent = tmpl.label;

                var preview = document.createElement('div');
                preview.className = 'template-item-prompt';
                preview.textContent = tmpl.prompt;

                item.appendChild(name);
                item.appendChild(preview);

                item.addEventListener('click', function () {
                    $promptInput.value = tmpl.prompt;
                    $templatePopover.classList.remove('visible');
                    $promptInput.focus();
                    // Place cursor at first underscore placeholder
                    var idx = tmpl.prompt.indexOf('_');
                    if (idx !== -1) {
                        $promptInput.setSelectionRange(idx, idx + 1);
                    }
                });

                $templatePopover.appendChild(item);
            });
        });
    }

    // ---- Hints ----

    /**
     * Update the hint bar below the input.
     */
    function updateHint() {
        if (!$inputHints) return;
        var compEnabled = $compToggle && $compToggle.checked;
        if (compEnabled) {
            // Try to get layer count for a comp-aware hint
            csInterface.evalScript('(function(){ try { var c = app.project.activeItem; return (c && c instanceof CompItem) ? c.numLayers : 0; } catch(e) { return 0; } })()', function (result) {
                var count = parseInt(result, 10) || 0;
                $inputHints.textContent = count > 0
                    ? AEConjure.Templates.getCompHint(count)
                    : AEConjure.Templates.getRandomHint();
            });
        } else {
            $inputHints.textContent = AEConjure.Templates.getRandomHint();
        }
    }

    // ---- Refine ----

    /**
     * Handle the AI refine button click.
     */
    function handleRefine() {
        var prompt = $promptInput.value.trim();
        if (!prompt || isProcessing) return;

        var provider = $providerSelect.value;
        var model = $modelSelect.value;
        var apiKey = AEConjure.Settings.getApiKey(provider);

        if (!apiKey) {
            AEConjure.UI.showToast('Set your API key first to use refine.', 'error');
            return;
        }

        $refineBtn.classList.add('refining');
        $refineBtn.disabled = true;

        var compPromise = ($compToggle && $compToggle.checked) ? getCompContext() : Promise.resolve('');

        compPromise.then(function (compContext) {
            return AEConjure.AIClient.refinePrompt({
                prompt: prompt,
                provider: provider,
                model: model,
                apiKey: apiKey,
                compContext: compContext
            });
        }).then(function (result) {
            if (result.success && result.refined) {
                $promptInput.value = result.refined;
                AEConjure.UI.showToast('Prompt refined!', 'success');
            } else {
                AEConjure.UI.showToast('Refine failed: ' + (result.error || 'Unknown error'), 'error');
            }
        }).catch(function (err) {
            AEConjure.UI.showToast('Refine error: ' + (err.message || err), 'error');
        }).then(function () {
            $refineBtn.classList.remove('refining');
            $refineBtn.disabled = false;
            $promptInput.focus();
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

    // ---- Multi-Turn Conversation ----

    /**
     * Build conversation history for AI context.
     * Returns the last N turns from chatHistory.
     *
     * @param {number} [maxTurns] - Max turns to include (default: 6)
     * @returns {Array<{role: string, content: string}>}
     */
    function buildConversationHistory(maxTurns) {
        maxTurns = maxTurns || 6;
        if (maxTurns <= 0) return [];
        var relevant = chatHistory.filter(function (msg) {
            return msg.role === 'user' || msg.role === 'assistant';
        });
        // Exclude the last entry (the current prompt was just pushed)
        if (relevant.length > 0) {
            relevant = relevant.slice(0, -1);
        }
        return relevant.slice(-maxTurns);
    }

    // ---- Chat Commands ----

    /**
     * Handle slash commands.
     */
    function handleCommand(input) {
        var parts = input.split(/\s+/);
        var cmd = parts[0].toLowerCase();

        switch (cmd) {
            case '/clear':
                chatHistory = [];
                $chatContainer.textContent = '';
                buildOnboarding();
                addSystemMessage('Chat cleared.');
                break;

            case '/undo':
                handleUndo();
                break;

            case '/help':
                addSystemMessage(
                    'Commands:\n' +
                    '  /clear \u2014 Clear chat history\n' +
                    '  /undo \u2014 Undo last script in After Effects\n' +
                    '  /help \u2014 Show this help\n' +
                    '  /context \u2014 Show current comp context\n' +
                    '  /kb \u2014 Show knowledge base stats\n' +
                    '\n' +
                    'Tips:\n' +
                    '  \u2022 Be specific: "red 100x100 solid" beats "make a layer"\n' +
                    '  \u2022 Conversation carries forward \u2014 say "now change its color"\n' +
                    '  \u2022 Use the sparkle button to refine vague prompts'
                );
                break;

            case '/context':
                csInterface.evalScript('getCompSummary()', function (result) {
                    addSystemMessage(result || 'No active composition.');
                });
                break;

            case '/kb':
                if (AEConjure.Knowledge && AEConjure.Knowledge.isReady()) {
                    var kb = AEConjure.Knowledge.stats();
                    addSystemMessage('Knowledge base v' + kb.version + ': ' + kb.atoms + ' API atoms, ' + kb.recipes + ' recipes, ' + kb.gotchas + ' gotchas');
                } else {
                    addSystemMessage('Knowledge base not loaded.');
                }
                break;

            default:
                addSystemMessage('Unknown command: ' + cmd + '. Type /help for available commands.');
        }
    }

    // ---- Undo ----

    /**
     * Undo the last script execution in After Effects.
     */
    function handleUndo() {
        csInterface.evalScript('undoLast()', function (result) {
            try {
                var parsed = JSON.parse(result);
                if (parsed.success) {
                    AEConjure.UI.showToast('Undone!', 'success');
                } else {
                    AEConjure.UI.showToast('Undo failed: ' + parsed.error, 'error');
                }
            } catch (e) {
                AEConjure.UI.showToast('Undo failed', 'error');
            }
        });
    }

    // ---- Explain ----

    /**
     * Send code to AI for explanation.
     */
    function handleExplain(code) {
        var provider = $providerSelect.value;
        var apiKey = AEConjure.Settings.getApiKey(provider);

        if (!apiKey) {
            AEConjure.UI.showToast('Set your API key first.', 'error');
            return;
        }

        addSystemMessage('Explaining...');

        AEConjure.AIClient.explainCode({
            code: code,
            provider: provider,
            model: $modelSelect.value,
            apiKey: apiKey
        }).then(function (result) {
            // Remove the "Explaining..." message
            var messages = $chatContainer.querySelectorAll('.message-system');
            if (messages.length > 0) {
                var last = messages[messages.length - 1];
                if (last.textContent === 'Explaining...') {
                    last.remove();
                }
            }

            if (result.success) {
                addMessage('assistant', result.rawResponse);
            } else {
                AEConjure.UI.showToast('Explain failed: ' + result.error, 'error');
            }
        }).catch(function (err) {
            AEConjure.UI.showToast('Explain error: ' + (err.message || err), 'error');
        });
    }

    // ---- Context Preview ----

    /**
     * Update the comp context preview bar.
     */
    function updateContextPreview() {
        if (!$contextText) return;

        if (!$compToggle || !$compToggle.checked) {
            $contextText.textContent = 'Comp context: off';
            if ($contextDetailText) $contextDetailText.textContent = '';
            return;
        }

        csInterface.evalScript('getCompSummary()', function (result) {
            if (result && result !== 'EvalScript error.' && result !== 'No active composition.') {
                var firstLine = result.split('\n')[0] || 'Active comp';
                $contextText.textContent = firstLine;
                if ($contextDetailText) $contextDetailText.textContent = result;
            } else {
                $contextText.textContent = 'No active composition';
                if ($contextDetailText) $contextDetailText.textContent = '';
            }
        });
    }

    // ---- Onboarding ----

    var ONBOARDING_EXAMPLES = [
        { icon: '\uD83C\uDFA8', label: 'Create layers', prompt: 'Create a red solid layer named "Background" sized to the comp' },
        { icon: '\u2728', label: 'Animate', prompt: 'Animate selected layer opacity from 0% to 100% over 2 seconds with ease' },
        { icon: '\uD83D\uDD27', label: 'Batch edit', prompt: 'Rename all layers sequentially as "Layer_01", "Layer_02", etc.' }
    ];

    /**
     * Build the onboarding screen inside chat container.
     */
    function buildOnboarding() {
        $onboarding = document.getElementById('onboarding');
        if (!$onboarding) return;

        // Build example cards
        var cards = document.getElementById('onboarding-cards');
        if (cards) {
            cards.textContent = '';
            ONBOARDING_EXAMPLES.forEach(function (ex) {
                var card = document.createElement('div');
                card.className = 'onboarding-card';

                var icon = document.createElement('span');
                icon.className = 'card-icon';
                icon.textContent = ex.icon;

                var textWrap = document.createElement('div');
                textWrap.className = 'card-text';

                var labelEl = document.createElement('span');
                labelEl.className = 'card-label';
                labelEl.textContent = ex.label;

                var promptEl = document.createElement('span');
                promptEl.className = 'card-prompt';
                promptEl.textContent = ex.prompt;

                textWrap.appendChild(labelEl);
                textWrap.appendChild(promptEl);
                card.appendChild(icon);
                card.appendChild(textWrap);

                card.addEventListener('click', function () {
                    $promptInput.value = ex.prompt;
                    $promptInput.focus();
                });

                cards.appendChild(card);
            });
        }

        // Wire setup button
        var keyBtn = document.getElementById('onboarding-key-btn');
        if (keyBtn) {
            keyBtn.onclick = function () { showSettings(); };
        }

        updateOnboardingStep();
    }

    /**
     * Update onboarding step to show checkmark if API key exists.
     */
    function updateOnboardingStep() {
        var step = document.getElementById('onboarding-step-key');
        if (!step) return;

        if (AEConjure.Settings.hasApiKey()) {
            step.classList.add('complete');
            var stepNum = step.querySelector('.step-number');
            if (stepNum) stepNum.textContent = '\u2713';
            var btn = document.getElementById('onboarding-key-btn');
            if (btn) btn.style.display = 'none';
        }
    }

    /**
     * Hide the onboarding screen.
     */
    function hideOnboarding() {
        if ($onboarding) $onboarding.style.display = 'none';
    }

    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
