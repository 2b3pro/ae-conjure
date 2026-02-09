/**
 * AE Conjure — UI Rendering
 * DOM creation, syntax highlighting, and message rendering.
 *
 * @version 1.0.0
 */

var AEConjure = AEConjure || {};

AEConjure.UI = (function () {
    'use strict';

    /**
     * Create a chat message element.
     *
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message content (plain text or code)
     * @param {Object} [meta] - Optional metadata { attempt, maxAttempts, success }
     * @returns {HTMLElement}
     */
    function createMessage(role, content, meta) {
        var msg = document.createElement('div');
        msg.className = 'message message-' + role;

        var label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = role === 'user' ? 'You' : 'AE Conjure';
        msg.appendChild(label);

        var body = document.createElement('div');
        body.className = 'message-body';

        if (role === 'assistant' && content) {
            // Parse the response for code blocks and text
            var parts = parseResponse(content);
            parts.forEach(function (part) {
                if (part.type === 'code') {
                    body.appendChild(createCodeBlock(part.content));
                } else {
                    var p = document.createElement('p');
                    p.textContent = part.content;
                    body.appendChild(p);
                }
            });
        } else {
            var p = document.createElement('p');
            p.textContent = content;
            body.appendChild(p);
        }

        msg.appendChild(body);

        // Add status badge if meta provided
        if (meta) {
            var badge = document.createElement('div');
            badge.className = 'message-status';
            if (meta.success) {
                badge.innerHTML = '<span class="status-success">&#10003; Script executed successfully</span>';
            } else if (meta.attempt && meta.maxAttempts) {
                badge.innerHTML = '<span class="status-retry">Attempt ' + meta.attempt + '/' + meta.maxAttempts + '</span>';
            } else if (meta.error) {
                badge.innerHTML = '<span class="status-error">&#10007; ' + escapeHtml(meta.error) + '</span>';
            }
            msg.appendChild(badge);
        }

        return msg;
    }

    /**
     * Create a code block element with basic syntax highlighting.
     *
     * @param {string} code
     * @returns {HTMLElement}
     */
    function createCodeBlock(code) {
        var container = document.createElement('div');
        container.className = 'code-block collapsed';

        var header = document.createElement('div');
        header.className = 'code-header';

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-icon code-toggle';
        toggleBtn.title = 'Show code';
        toggleBtn.textContent = '\u25B6';
        toggleBtn.onclick = function () {
            var isCollapsed = container.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '\u25B6' : '\u25BC';
            toggleBtn.title = isCollapsed ? 'Show code' : 'Hide code';
        };

        var label = document.createElement('span');
        label.textContent = 'ExtendScript';

        var lineCount = document.createElement('span');
        lineCount.className = 'code-line-count';
        var lines = code.split('\n').length;
        lineCount.textContent = lines + ' line' + (lines !== 1 ? 's' : '');

        var headerLeft = document.createElement('div');
        headerLeft.className = 'code-header-left';
        headerLeft.appendChild(toggleBtn);
        headerLeft.appendChild(label);
        headerLeft.appendChild(lineCount);

        var copyBtn = document.createElement('button');
        copyBtn.className = 'btn-icon';
        copyBtn.title = 'Copy code';
        copyBtn.textContent = '\uD83D\uDCCB';
        copyBtn.onclick = function () {
            copyToClipboard(code);
            copyBtn.textContent = '\u2713';
            setTimeout(function () { copyBtn.textContent = '\uD83D\uDCCB'; }, 1500);
        };

        header.appendChild(headerLeft);
        header.appendChild(copyBtn);

        var pre = document.createElement('pre');
        var codeEl = document.createElement('code');
        codeEl.textContent = code;
        pre.appendChild(codeEl);

        container.appendChild(header);
        container.appendChild(pre);

        return container;
    }

    /**
     * Create a progress indicator for retry attempts.
     *
     * @param {number} current - Current attempt number
     * @param {number} max - Max attempts
     * @param {string} status - Current status text
     * @returns {HTMLElement}
     */
    function createProgress(current, max, status) {
        var el = document.createElement('div');
        el.className = 'progress-indicator';
        el.id = 'progress';

        var bar = document.createElement('div');
        bar.className = 'progress-bar';
        var fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.style.width = ((current / max) * 100) + '%';
        bar.appendChild(fill);

        var text = document.createElement('div');
        text.className = 'progress-text';
        text.textContent = status + ' (attempt ' + current + '/' + max + ')';

        el.appendChild(bar);
        el.appendChild(text);
        return el;
    }

    /**
     * Create a "Save to Library" prompt bar.
     *
     * @param {string} code - The code to save
     * @param {string} prompt - The original user prompt
     * @param {Function} onSave - Callback when user saves
     * @returns {HTMLElement}
     */
    function createSavePrompt(code, prompt, onSave) {
        var el = document.createElement('div');
        el.className = 'save-prompt';

        var text = document.createElement('span');
        text.textContent = 'Script ran successfully. ';

        var btn = document.createElement('button');
        btn.className = 'btn btn-small';
        btn.textContent = 'Save to Library';
        btn.onclick = function () {
            var name = window.prompt('Script name:', prompt.substring(0, 50));
            if (name) {
                onSave({ name: name, code: code, prompt: prompt });
                el.innerHTML = '<span class="status-success">&#10003; Saved to library</span>';
            }
        };

        el.appendChild(text);
        el.appendChild(btn);
        return el;
    }

    /**
     * Render the library panel content.
     *
     * @param {Object[]} scripts - Array of library script entries
     * @param {Object} handlers - { onRun, onDelete, onFavorite, onEdit }
     * @returns {HTMLElement}
     */
    function renderLibraryList(scripts, handlers) {
        var list = document.createElement('div');
        list.className = 'library-list';

        if (scripts.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'library-empty';
            empty.textContent = 'No saved scripts yet. Run a script and save it to build your library.';
            list.appendChild(empty);
            return list;
        }

        scripts.forEach(function (script) {
            var item = document.createElement('div');
            item.className = 'library-item';

            var itemHeader = document.createElement('div');
            itemHeader.className = 'library-item-header';

            var favBtn = document.createElement('button');
            favBtn.className = 'btn-icon fav-btn' + (script.favorite ? ' active' : '');
            favBtn.innerHTML = script.favorite ? '&#9733;' : '&#9734;';
            favBtn.title = 'Toggle favorite';
            favBtn.onclick = function () { handlers.onFavorite(script.id); };

            var nameEl = document.createElement('span');
            nameEl.className = 'library-item-name';
            nameEl.textContent = script.name;

            var catEl = document.createElement('span');
            catEl.className = 'library-item-category';
            catEl.textContent = script.category;

            itemHeader.appendChild(favBtn);
            itemHeader.appendChild(nameEl);
            itemHeader.appendChild(catEl);

            var desc = document.createElement('div');
            desc.className = 'library-item-desc';
            desc.textContent = script.description || script.prompt || '';

            var actions = document.createElement('div');
            actions.className = 'library-item-actions';

            var runBtn = document.createElement('button');
            runBtn.className = 'btn btn-small btn-primary';
            runBtn.textContent = 'Run';
            runBtn.onclick = function () { handlers.onRun(script); };

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-small btn-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = function () {
                handlers.onDelete(script.id);
            };

            actions.appendChild(runBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(itemHeader);
            if (desc.textContent) item.appendChild(desc);
            item.appendChild(actions);
            list.appendChild(item);
        });

        return list;
    }

    /**
     * Parse AI response into text and code parts.
     *
     * @param {string} text
     * @returns {Array<{type: string, content: string}>}
     */
    function parseResponse(text) {
        var parts = [];
        var regex = /```(?:javascript|jsx|extendscript)?\s*\n?([\s\S]*?)```/g;
        var lastIndex = 0;
        var match;

        while ((match = regex.exec(text)) !== null) {
            // Text before code block
            if (match.index > lastIndex) {
                var before = text.substring(lastIndex, match.index).trim();
                if (before) parts.push({ type: 'text', content: before });
            }
            // Code block
            parts.push({ type: 'code', content: match[1].trim() });
            lastIndex = regex.lastIndex;
        }

        // Remaining text after last code block
        if (lastIndex < text.length) {
            var remaining = text.substring(lastIndex).trim();
            if (remaining) parts.push({ type: 'text', content: remaining });
        }

        // If no code blocks found, return as plain text
        if (parts.length === 0) {
            parts.push({ type: 'text', content: text });
        }

        return parts;
    }

    /**
     * Escape HTML special characters.
     */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Copy text to clipboard.
     */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        } else {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
            } catch (e) {
                // Copy not supported
            }
            document.body.removeChild(textarea);
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {string} [type] - 'success', 'error', 'info'
     */
    function showToast(message, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function () { toast.classList.add('show'); }, 10);
        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { document.body.removeChild(toast); }, 300);
        }, 3000);
    }

    // Public API
    return {
        createMessage: createMessage,
        createCodeBlock: createCodeBlock,
        createProgress: createProgress,
        createSavePrompt: createSavePrompt,
        renderLibraryList: renderLibraryList,
        parseResponse: parseResponse,
        escapeHtml: escapeHtml,
        copyToClipboard: copyToClipboard,
        showToast: showToast
    };
})();
