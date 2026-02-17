// Current filter state
let currentFilter = 'recents';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    const { isMac, isWindows, windowControls, onWindowMaximized, database, images, pathUtils } = window.electron;

    // Get toast elements
    const toastBar = document.getElementById('toast-bar');
    const toastMessage = document.getElementById('toast-message');
    let toastTimeout = null;

    // Get control elements
    const rowA = document.getElementById('row-a');
    const windowsControls = document.getElementById('windows-controls');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    // Get new UI elements
    const filterDropdown = document.getElementById('filter-dropdown');
    const filterMenu = document.getElementById('filter-menu');
    const filterOptions = document.querySelectorAll('.filter-option');
    const addBtn = document.getElementById('add-btn');
    const contentArea = document.getElementById('content');

    // Get modal elements
    const modal = document.getElementById('add-table-modal');
    const modalInput = document.getElementById('table-name-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalAddBtn = document.getElementById('modal-add-btn');

    // Show/hide controls based on platform
    if (!rowA || !windowsControls) {
        console.error('Critical UI elements not found:', { rowA: !!rowA, windowsControls: !!windowsControls });
    } else {
        console.log('Platform detection:', { isMac, isWindows, platform: window.electron?.platform });
        
        if (isMac) {
            windowsControls.style.display = 'none';
            rowA.classList.add('mac-row-a');
        } else if (isWindows) {
            // Add Windows class first to trigger CSS
            rowA.classList.add('windows-row-a');
            // Then set inline style as backup
            windowsControls.style.display = 'flex';
            console.log('Windows controls should be visible now');
        } else {
            // Linux or other platforms - show Windows-style controls
            rowA.classList.add('windows-row-a');
            windowsControls.style.display = 'flex';
        }
    }

    // Filter dropdown toggle
    filterDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMenu.classList.toggle('hidden');
        filterDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!filterMenu.classList.contains('hidden') &&
            !filterMenu.contains(e.target) &&
            !filterDropdown.contains(e.target)) {
            filterMenu.classList.add('hidden');
            filterDropdown.classList.remove('open');
        }
    });

    // Filter option selection
    filterOptions.forEach(option => {
        option.addEventListener('click', async () => {
            const filterValue = option.dataset.filter;

            // Update current filter
            currentFilter = filterValue;

            // Update active state
            filterOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // Update dropdown button text
            filterDropdown.querySelector('span').textContent = filterValue;

            // Close menu
            filterMenu.classList.add('hidden');
            filterDropdown.classList.remove('open');

            // Render filtered tables
            await renderTables();
        });
    });

    // Add button handler - show modal
    addBtn.addEventListener('click', () => {
        if (!modal || !modalInput) {
            console.error('Modal elements not found!');
            return;
        }
        modal.classList.remove('hidden');
        modalInput.value = '';
        modalInput.focus();
    });

    // Modal cancel button
    modalCancelBtn?.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Modal add button
    modalAddBtn?.addEventListener('click', async () => {
        const tableName = modalInput.value.trim() || 'Untitled Table';
        modal.classList.add('hidden');
        await createNewTable(tableName);
    });

    // Handle Enter key in modal input
    modalInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const tableName = modalInput.value.trim() || 'Untitled Table';
            modal.classList.add('hidden');
            await createNewTable(tableName);
        } else if (e.key === 'Escape') {
            modal.classList.add('hidden');
        }
    });

    // Close modal when clicking overlay
    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-overlay')) {
            modal.classList.add('hidden');
        }
    });

    // Get confirmation modal elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    let confirmCallback = null;

    // Confirmation modal handlers
    confirmCancelBtn?.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    confirmOkBtn?.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    // Close confirmation modal when clicking overlay
    confirmModal?.addEventListener('click', (e) => {
        if (e.target === confirmModal || e.target.classList.contains('modal-overlay')) {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        }
    });

    // Helper function to show confirmation dialog
    function showConfirmation(message, onConfirm) {
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmModal.classList.remove('hidden');
    }

    // Close any open options menus when clicking outside
    document.addEventListener('click', (e) => {
        const openMenus = document.querySelectorAll('.options-menu:not(.hidden)');
        openMenus.forEach(menu => {
            const optionsBtn = menu.previousElementSibling;
            if (!menu.contains(e.target) && e.target !== optionsBtn && !optionsBtn?.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    });

    /* ============================================
       CELL CONTEXT MENU
       ============================================ */

    // Create context menu element
    const cellContextMenu = document.createElement('div');
    cellContextMenu.className = 'cell-context-menu';
    cellContextMenu.id = 'cell-context-menu';

    const highlightColors = [
        { name: 'Soft Red', color: '#ffd6cc' },
        { name: 'Soft Orange', color: '#ffe4cc' },
        { name: 'Soft Yellow', color: '#fff5cc' },
        { name: 'Soft Green', color: '#d6f5d6' },
        { name: 'Soft Blue', color: '#ccf0ff' }
    ];

    cellContextMenu.innerHTML = `
        <button class="cell-context-menu-item" data-action="copy">
            <span>Copy</span>
        </button>
        <button class="cell-context-menu-item" data-action="paste">
            <span>Paste</span>
        </button>
        <div class="cell-context-menu-separator"></div>
        <button class="cell-context-menu-item" data-action="clear">
            <span>Clear</span>
        </button>
        <div class="cell-context-menu-separator"></div>
        <button class="cell-context-menu-item" data-action="highlight">
            <span>Highlight</span>
            <svg class="submenu-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
            <div class="highlight-submenu">
                <div class="highlight-color-grid">
                    ${highlightColors.map(({ name, color }) =>
        `<div class="highlight-color-option" data-color="${color}" style="background: ${color};" title="${name}"></div>`
    ).join('')}
                    <div class="highlight-color-option none" data-color="none" title="No Highlight"></div>
                </div>
            </div>
        </button>
    `;

    document.body.appendChild(cellContextMenu);

    const highlightSubmenu = cellContextMenu.querySelector('.highlight-submenu');
    const highlightMenuItem = cellContextMenu.querySelector('[data-action="highlight"]');

    // Show/hide highlight submenu on hover
    highlightMenuItem.addEventListener('mouseenter', () => {
        highlightSubmenu.classList.add('visible');
    });

    highlightMenuItem.addEventListener('mouseleave', (e) => {
        // Don't hide if moving into submenu
        if (!highlightSubmenu.contains(e.relatedTarget)) {
            highlightSubmenu.classList.remove('visible');
        }
    });

    highlightSubmenu.addEventListener('mouseleave', () => {
        highlightSubmenu.classList.remove('visible');
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
        if (!cellContextMenu.contains(e.target)) {
            cellContextMenu.classList.remove('visible');
            highlightSubmenu.classList.remove('visible');
        }
    });

    // Track current context menu target cell
    let contextMenuTargetCell = null;

    // Context menu action handlers
    cellContextMenu.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        const colorOption = e.target.closest('[data-color]');

        if (colorOption && contextMenuTargetCell) {
            // Handle highlight color selection
            const color = colorOption.dataset.color;
            const tableId = contextMenuTargetCell.dataset.tableId;
            const rowIndex = parseInt(contextMenuTargetCell.dataset.row);
            const colIndex = parseInt(contextMenuTargetCell.dataset.col);

            const tables = await database.getAll();
            const table = tables.find(t => t._id === tableId);
            if (!table) return;

            if (!table.highlights) table.highlights = {};
            const cellKey = `${rowIndex}-${colIndex}`;

            if (color === 'none') {
                delete table.highlights[cellKey];
            } else {
                table.highlights[cellKey] = color;
            }

            await database.update(tableId, { highlights: table.highlights });
            await renderTables();

            cellContextMenu.classList.remove('visible');
            highlightSubmenu.classList.remove('visible');
            return;
        }

        if (!actionBtn || !contextMenuTargetCell) return;

        const action = actionBtn.dataset.action;
        const tableId = contextMenuTargetCell.dataset.tableId;
        const rowIndex = parseInt(contextMenuTargetCell.dataset.row);
        const colIndex = parseInt(contextMenuTargetCell.dataset.col);

        const tables = await database.getAll();
        const table = tables.find(t => t._id === tableId);
        if (!table) return;

        const cellValue = table.data[rowIndex][colIndex];

        switch (action) {
            case 'copy':
                if (isImageCell(cellValue)) {
                    // Copy image
                    const imgPath = getImagePath(cellValue);
                    try {
                        // Convert path to proper file:// URL for cross-platform compatibility
                        const fileUrl = await pathUtils.toFileUrl(imgPath);
                        const response = await fetch(fileUrl);
                        const blob = await response.blob();
                        await navigator.clipboard.write([
                            new ClipboardItem({ [blob.type]: blob })
                        ]);
                        showToast(`Copied image`);
                    } catch (error) {
                        console.error('Copy failed:', error);
                        showToast(`Failed to copy image`, true);
                    }
                } else if (cellValue) {
                    // Copy text
                    await navigator.clipboard.writeText(cellValue);
                    showToast(`Copied "${cellValue.substring(0, 20)}${cellValue.length > 20 ? '...' : ''}"`);
                }
                break;

            case 'paste':
                try {
                    const clipboardItems = await navigator.clipboard.read();
                    let pasted = false;

                    for (const item of clipboardItems) {
                        // Try image first
                        if (item.types.includes('image/png')) {
                            if (cellValue && !isImageCell(cellValue)) {
                                showToast(`Can't paste image into text cell`, true);
                                break;
                            }
                            if (isImageCell(cellValue)) {
                                showToast(`Cell already has an image`, true);
                                break;
                            }

                            const blob = await item.getType('image/png');
                            const arrayBuffer = await blob.arrayBuffer();
                            const filePath = await images.save(arrayBuffer);
                            const cellData = `IMG:${filePath}`;

                            table.data[rowIndex][colIndex] = cellData;
                            await database.update(tableId, { data: table.data });
                            await renderTables();
                            showToast(`Image pasted`);
                            pasted = true;
                            break;
                        }
                    }

                    if (!pasted) {
                        // Try text
                        const text = await navigator.clipboard.readText();
                        if (text) {
                            if (isImageCell(cellValue)) {
                                showToast(`Can't paste text into image cell`, true);
                            } else {
                                table.data[rowIndex][colIndex] = text;
                                await database.update(tableId, { data: table.data });
                                await renderTables();
                                showToast(`Text pasted`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Paste failed:', error);
                }
                break;

            case 'clear':
                table.data[rowIndex][colIndex] = '';

                // Also clear highlight if exists
                if (table.highlights) {
                    const cellKey = `${rowIndex}-${colIndex}`;
                    delete table.highlights[cellKey];
                }

                await database.update(tableId, {
                    data: table.data,
                    highlights: table.highlights || {}
                });
                await renderTables();
                showToast(`Cell cleared`);
                break;

            case 'highlight':
                // Submenu will handle this
                return;
        }

        cellContextMenu.classList.remove('visible');
        highlightSubmenu.classList.remove('visible');
    });


    // Wire up window control buttons
    minimizeBtn?.addEventListener('click', () => {
        windowControls.minimize();
    });

    maximizeBtn?.addEventListener('click', async () => {
        await windowControls.maximize();
        updateMaximizeButton();
    });

    closeBtn?.addEventListener('click', () => {
        windowControls.close();
    });

    // Update maximize button icon based on window state
    async function updateMaximizeButton() {
        const isMaximized = await windowControls.isMaximized();
        if (maximizeBtn) {
            if (isMaximized) {
                maximizeBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <rect x="0" y="2" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        `;
            } else {
                maximizeBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="0" y="0" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        `;
            }
        }
    }

    // Listen for window state changes
    onWindowMaximized((isMaximized) => {
        updateMaximizeButton();
    });

    // Initial state
    updateMaximizeButton();

    /* ============================================
       UTILITY FUNCTIONS
       ============================================ */

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {boolean} isError - If true, show red error toast; if false/undefined, show green success toast
     */
    function showToast(message, isError = false) {
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toastMessage.textContent = message;
        toastBar.classList.remove('hidden');

        // Set error or success styling
        if (isError) {
            toastBar.classList.add('error');
        } else {
            toastBar.classList.remove('error');
        }

        // Trigger animation
        setTimeout(() => {
            toastBar.classList.add('visible');
        }, 10);

        // Auto-hide after 2 seconds
        toastTimeout = setTimeout(() => {
            toastBar.classList.remove('visible');
            setTimeout(() => {
                toastBar.classList.add('hidden');
            }, 200); // Wait for fade-out animation
        }, 2000);
    }

    /**
     * Check if cell value is an image
     */
    function isImageCell(value) {
        return typeof value === 'string' && value.startsWith('IMG:');
    }

    /**
     * Extract image path from cell value
     */
    function getImagePath(value) {
        return value.substring(4); // Remove "IMG:" prefix
    }

    /* ============================================
       TABLE RENDERING LOGIC
       ============================================ */

    /**
     * Render tables based on current filter
     */
    async function renderTables() {
        // Map plural filter to singular database type
        const typeMap = {
            'recents': 'recent',
            'starred': 'starred',
            'archives': 'archives'
        };
        const dbType = typeMap[currentFilter] || currentFilter;

        const tables = await database.getByType(dbType);

        contentArea.innerHTML = '';

        if (tables.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No tables yet. Click "+ add" to create one.</div>';
            return;
        }

        tables.forEach(table => {
            const tableElement = createTableElement(table);
            contentArea.appendChild(tableElement);
        });
    }

    /**
     * Create a new table
     * @param {String} tableName - Name for the new table
     */
    async function createNewTable(tableName = 'Untitled Table') {
        const newTable = await database.create({
            name: tableName,
            type: 'recent',
            columns: 3,
            data: [
                ['', '', '']
            ]
        });

        // If we're viewing recents, re-render to show the new table
        if (currentFilter === 'recents') {
            await renderTables();
        }
    }

    /**
     * Create DOM element for a table
     */
    function createTableElement(table) {
        const tableNote = document.createElement('div');
        tableNote.className = 'table-note';
        tableNote.dataset.id = table._id;

        // Initialize checked array for backward compatibility
        if (!table.checked || table.checked.length !== table.data.length) {
            table.checked = table.data.map(() => false);
        }

        // D1: Table Area
        const tableArea = document.createElement('div');
        tableArea.className = 'table-area';

        const tableGrid = document.createElement('div');
        tableGrid.className = 'table-grid';
        tableGrid.dataset.columns = table.columns;

        // Add checklist-mode class for smooth transitions
        if (table.checklist) {
            tableGrid.classList.add('checklist-mode');
        }

        // Set grid columns: checkbox column (36px) + data columns if in checklist mode
        if (table.checklist) {
            tableGrid.style.gridTemplateColumns = `36px repeat(${table.columns}, 1fr)`;
        } else {
            tableGrid.style.gridTemplateColumns = `repeat(${table.columns}, 1fr)`;
        }

        // Create cells
        table.data.forEach((row, rowIndex) => {
            // If in checklist mode, add checkbox cell first
            if (table.checklist) {
                const checkboxCell = document.createElement('div');
                checkboxCell.className = 'checkbox-cell';
                checkboxCell.dataset.row = rowIndex;
                checkboxCell.dataset.tableId = table._id;

                const isChecked = table.checked[rowIndex] || false;
                checkboxCell.innerHTML = `
                    <div class="checkbox-box ${isChecked ? 'checked' : ''}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                `;

                // Checkbox click handler
                checkboxCell.addEventListener('click', async () => {
                    const currentChecked = table.checked[rowIndex];
                    table.checked[rowIndex] = !currentChecked;

                    // Update database
                    await database.update(table._id, { checked: table.checked });

                    // Re-render to update checkbox and badge
                    await renderTables();
                });

                tableGrid.appendChild(checkboxCell);
            }

            // Add data cells
            row.forEach((cellValue, colIndex) => {
                const cell = document.createElement('div');
                cell.className = 'table-cell';
                cell.dataset.row = rowIndex;
                cell.dataset.col = colIndex;
                cell.dataset.tableId = table._id;

                // Track long-press state
                let longPressTimer = null;
                let isLongPress = false;

                // Mutable cell value tracking - updated when content changes
                let currentCellValue = cellValue;

                // Render cell content (image or text)
                const renderCell = async (value) => {
                    currentCellValue = value;  // Keep closure updated
                    if (isImageCell(value)) {
                        // Image cell
                        cell.classList.add('image-cell');
                        cell.contentEditable = false;
                        const imgPath = getImagePath(value);
                        try {
                            // Convert path to proper file:// URL for cross-platform compatibility
                            const fileUrl = await pathUtils.toFileUrl(imgPath);
                            cell.innerHTML = `<img src="${fileUrl}" alt="cell image">`;
                        } catch (error) {
                            console.error('Failed to load image:', error);
                            cell.innerHTML = '<span style="color: #e81123;">Image not found</span>';
                        }
                    } else {
                        // Text cell
                        cell.classList.remove('image-cell');
                        cell.contentEditable = true;
                        cell.textContent = value;
                    }
                };

                // Initial render (async, but we don't await to avoid blocking)
                renderCell(cellValue).catch(err => console.error('Render cell error:', err));

                // Apply highlight if exists
                if (table.highlights) {
                    const cellKey = `${rowIndex}-${colIndex}`;
                    const highlightColor = table.highlights[cellKey];
                    if (highlightColor) {
                        cell.style.backgroundColor = highlightColor;
                        cell.dataset.highlight = highlightColor;
                    }
                }

                // Right-click context menu
                cell.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    contextMenuTargetCell = cell;

                    // Position menu at cursor
                    cellContextMenu.style.left = `${e.clientX}px`;
                    cellContextMenu.style.top = `${e.clientY}px`;
                    cellContextMenu.classList.add('visible');

                    // Hide submenu
                    const highlightSubmenu = cellContextMenu.querySelector('.highlight-submenu');
                    if (highlightSubmenu) {
                        highlightSubmenu.classList.remove('visible');
                    }
                });

                // Auto-save on blur (text cells only)
                cell.addEventListener('blur', async () => {
                    if (!isImageCell(currentCellValue)) {
                        const newValue = cell.textContent;
                        currentCellValue = newValue;
                        await saveCellData(table._id, rowIndex, colIndex, newValue);
                    }
                });

                // Prevent Enter key from adding newlines in text cells
                cell.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !isImageCell(currentCellValue)) {
                        e.preventDefault();
                        cell.blur();
                    }
                });

                // Paste interception
                cell.addEventListener('paste', async (e) => {
                    e.preventDefault();

                    const clipboardItems = e.clipboardData.items;
                    let hasImage = false;
                    let imageItem = null;

                    // Check for image in clipboard
                    for (let item of clipboardItems) {
                        if (item.type.indexOf('image') !== -1) {
                            hasImage = true;
                            imageItem = item;
                            break;
                        }
                    }

                    if (hasImage && imageItem) {
                        // Image paste
                        // Rule: Can't paste image into cell that has text
                        if (currentCellValue && !isImageCell(currentCellValue)) {
                            showToast(`Can't paste image into text cell`, true);
                            return;
                        }

                        // Rule: Can't paste image into cell that already has an image
                        if (isImageCell(currentCellValue)) {
                            showToast(`Cell already has an image`, true);
                            return;
                        }

                        // Process the image
                        const blob = imageItem.getAsFile();
                        const arrayBuffer = await blob.arrayBuffer();

                        try {
                            // Save to disk via IPC
                            const filePath = await images.save(arrayBuffer);
                            const cellData = `IMG:${filePath}`;

                            // Update database
                            await saveCellData(table._id, rowIndex, colIndex, cellData);

                            // Update local reference and re-render
                            table.data[rowIndex][colIndex] = cellData;
                            await renderCell(cellData);

                            showToast(`Image added to cell`);
                        } catch (error) {
                            console.error('Failed to save image:', error);
                            showToast(`Failed to save image`, true);
                        }
                    } else {
                        // Text paste
                        // Rule: Can't paste text into image cell
                        if (isImageCell(currentCellValue)) {
                            showToast(`Can't paste text into image cell`, true);
                            return;
                        }

                        // Allow text paste
                        const text = e.clipboardData.getData('text/plain');
                        document.execCommand('insertText', false, text);
                    }
                });

                // Double-click paste
                cell.addEventListener('dblclick', async (e) => {
                    e.preventDefault();

                    try {
                        const clipboardItems = await navigator.clipboard.read();

                        for (const item of clipboardItems) {
                            // Try image first
                            if (item.types.includes('image/png')) {
                                // Block if cell has text
                                if (currentCellValue && !isImageCell(currentCellValue)) {
                                    showToast(`Can't paste image into text cell`, true);
                                    return;
                                }

                                // Block if cell has image
                                if (isImageCell(currentCellValue)) {
                                    showToast(`Cell already has an image`, true);
                                    return;
                                }

                                const blob = await item.getType('image/png');
                                const arrayBuffer = await blob.arrayBuffer();

                                const filePath = await images.save(arrayBuffer);
                                const cellData = `IMG:${filePath}`;

                                await saveCellData(table._id, rowIndex, colIndex, cellData);
                                table.data[rowIndex][colIndex] = cellData;
                                await renderCell(cellData);

                                showToast(`Image pasted`);
                                return;
                            }
                        }

                        // Try text
                        const text = await navigator.clipboard.readText();
                        if (text) {
                            // Block if cell has image
                            if (isImageCell(currentCellValue)) {
                                showToast(`Can't paste text into image cell`, true);
                                return;
                            }

                            // If cell is empty, paste directly
                            if (!currentCellValue) {
                                cell.textContent = text;
                                currentCellValue = text;
                                await saveCellData(table._id, rowIndex, colIndex, text);
                            } else {
                                // Append with newline (stored but not visibly shown)
                                const newValue = currentCellValue + '\n' + text;
                                cell.textContent = newValue;
                                currentCellValue = newValue;
                                await saveCellData(table._id, rowIndex, colIndex, newValue);
                            }

                            showToast(`Text pasted`);
                        }
                    } catch (error) {
                        console.error('Clipboard read failed:', error);
                    }
                });

                // Long-press copy
                cell.addEventListener('mousedown', (e) => {
                    isLongPress = false;

                    longPressTimer = setTimeout(async () => {
                        isLongPress = true;
                        cell.classList.add('long-pressing');

                        if (isImageCell(currentCellValue)) {
                            // Copy image as blob
                            const imgPath = getImagePath(currentCellValue);
                            // Extract filename (handle both forward and backslashes)
                            const filename = imgPath.split(/[/\\]/).pop() || 'image';

                            try {
                                // Convert path to proper file:// URL for cross-platform compatibility
                                const fileUrl = await pathUtils.toFileUrl(imgPath);
                                const response = await fetch(fileUrl);
                                const blob = await response.blob();

                                // Write blob to clipboard
                                await navigator.clipboard.write([
                                    new ClipboardItem({
                                        [blob.type]: blob
                                    })
                                ]);

                                showToast(`copied ${filename}`);
                            } catch (error) {
                                console.error('Copy image failed:', error);
                                showToast(`Failed to copy image`, true);
                            }
                        } else if (currentCellValue) {
                            // Copy text
                            try {
                                await navigator.clipboard.writeText(currentCellValue);
                                const preview = currentCellValue.length > 20 ?
                                    currentCellValue.substring(0, 20) + '...' : currentCellValue;
                                showToast(`copied "${preview}"`);
                            } catch (error) {
                                console.error('Copy failed:', error);
                            }
                        }

                        setTimeout(() => {
                            cell.classList.remove('long-pressing');
                        }, 150);
                    }, 500); // 500ms long press
                });

                cell.addEventListener('mouseup', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                    }
                    if (isLongPress) {
                        // Prevent normal click behavior after long press
                        setTimeout(() => {
                            isLongPress = false;
                        }, 100);
                    }
                });

                cell.addEventListener('mouseleave', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                    }
                    cell.classList.remove('long-pressing');
                });

                tableGrid.appendChild(cell);
            });
        });

        tableArea.appendChild(tableGrid);

        // D2: Footer Bar
        const tableFooter = document.createElement('div');
        tableFooter.className = 'table-footer';
        tableFooter.style.position = 'relative'; // For absolute positioning of menu

        // Completion Badge (only in checklist mode)
        if (table.checklist) {
            const completionBadge = document.createElement('span');
            completionBadge.className = 'completion-badge';
            const checkedCount = table.checked.filter(Boolean).length;
            const totalCount = table.checked.length;
            const percentage = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
            completionBadge.textContent = `${percentage}%`;
            tableFooter.appendChild(completionBadge);
        }

        const tableName = document.createElement('input');
        tableName.type = 'text';
        tableName.className = 'table-name';
        tableName.value = table.name;
        tableName.placeholder = 'Untitled Table';

        // Auto-save name on blur
        tableName.addEventListener('blur', async () => {
            await database.update(table._id, { name: tableName.value });
        });

        // Add Row Button (visible on hover)
        const addRowBtn = document.createElement('button');
        addRowBtn.className = 'add-row-btn';
        addRowBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>add row</span>
        `;
        addRowBtn.title = 'Add row';
        addRowBtn.addEventListener('click', async () => {
            await addNewRow(table._id, tableGrid, table.columns);
        });

        const optionsBtn = document.createElement('button');
        optionsBtn.className = 'options-btn';
        optionsBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="19" r="2"/>
            </svg>
        `;
        optionsBtn.title = 'Options';

        // Create options menu
        const optionsMenu = createOptionsMenu(table);

        // Toggle options menu
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close all other open menus first
            const allMenus = document.querySelectorAll('.options-menu:not(.hidden)');
            allMenus.forEach(menu => {
                if (menu !== optionsMenu) {
                    menu.classList.add('hidden');
                }
            });

            // Toggle this menu
            const wasHidden = optionsMenu.classList.contains('hidden');
            optionsMenu.classList.toggle('hidden');

            // If we just opened the menu, check positioning
            if (wasHidden) {
                // Use setTimeout to ensure the menu is rendered before measuring
                setTimeout(() => {
                    const menuRect = optionsMenu.getBoundingClientRect();
                    const buttonRect = optionsBtn.getBoundingClientRect();
                    const headerHeight = 84; // var(--header-total-height) = 40px + 44px
                    const menuHeight = menuRect.height;
                    const spaceAbove = buttonRect.top - headerHeight;
                    const minSpaceNeeded = menuHeight + 10; // Menu height + margin

                    // Flip below if:
                    // 1. Menu would overlap with header, OR
                    // 2. Not enough space above the button to show full menu
                    if (menuRect.top < headerHeight + 10 || spaceAbove < minSpaceNeeded) {
                        optionsMenu.classList.add('flip-below');
                    } else {
                        optionsMenu.classList.remove('flip-below');
                    }
                }, 0);
            }
        });

        tableFooter.appendChild(tableName);
        tableFooter.appendChild(addRowBtn);
        tableFooter.appendChild(optionsBtn);
        tableFooter.appendChild(optionsMenu);

        tableNote.appendChild(tableArea);
        tableNote.appendChild(tableFooter);

        return tableNote;
    }

    /**
     * Create options menu for a table
     */
    function createOptionsMenu(table) {
        const menu = document.createElement('div');
        menu.className = 'options-menu hidden';

        // 1. Pin/Unpin
        const pinBtn = document.createElement('button');
        pinBtn.className = 'options-menu-item';
        pinBtn.innerHTML = `<span>${table.pinned ? 'Unpin' : 'Pin'}</span>`;
        pinBtn.addEventListener('click', async () => {
            await database.update(table._id, { pinned: !table.pinned });
            menu.classList.add('hidden');
            await renderTables();
        });

        // 2. Column Control
        const columnControl = document.createElement('div');
        columnControl.className = 'options-menu-item';
        columnControl.innerHTML = `
            <div class="column-control">
                <button class="column-control-btn" data-action="remove">−</button>
                <span class="column-control-count">${table.columns}</span>
                <button class="column-control-btn" data-action="add">+</button>
            </div>
        `;

        const removeColBtn = columnControl.querySelector('[data-action="remove"]');
        const addColBtn = columnControl.querySelector('[data-action="add"]');

        // Disable buttons at limits
        if (table.columns <= 1) removeColBtn.disabled = true;
        if (table.columns >= 100) addColBtn.disabled = true;

        // Add column
        addColBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (table.columns >= 100) return;

            const newData = table.data.map(row => [...row, '']);
            await database.update(table._id, {
                columns: table.columns + 1,
                data: newData
            });
            menu.classList.add('hidden');
            await renderTables();
        });

        // Remove column
        removeColBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (table.columns <= 1) return;

            // Check if last column has data
            const lastColIndex = table.columns - 1;
            const cellsWithData = [];
            table.data.forEach((row, rowIndex) => {
                if (row[lastColIndex]?.trim()) {
                    cellsWithData.push(`R${rowIndex + 1}C${lastColIndex + 1}`);
                }
            });

            if (cellsWithData.length > 0) {
                // Show confirmation
                const message = `Cells ${cellsWithData.join(', ')} have data. Delete anyway?`;
                showConfirmation(message, async () => {
                    const newData = table.data.map(row => row.slice(0, -1));
                    await database.update(table._id, {
                        columns: table.columns - 1,
                        data: newData
                    });
                    await renderTables();
                });
            } else {
                // Remove directly
                const newData = table.data.map(row => row.slice(0, -1));
                await database.update(table._id, {
                    columns: table.columns - 1,
                    data: newData
                });
                await renderTables();
            }
            menu.classList.add('hidden');
        });

        // 3. Checklist Toggle
        const checklistToggleItem = document.createElement('div');
        checklistToggleItem.className = 'options-menu-item';
        checklistToggleItem.innerHTML = `
            <div class="checklist-toggle-container">
                <span class="checklist-toggle-label">Checklist</span>
                <div class="checklist-toggle ${table.checklist ? 'active' : ''}">
                    <div class="checklist-toggle-knob"></div>
                </div>
            </div>
        `;

        const toggleSwitch = checklistToggleItem.querySelector('.checklist-toggle');
        toggleSwitch.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newChecklistState = !table.checklist;

            // Initialize checked array if turning on checklist mode
            let checkedArray = table.checked || [];
            if (newChecklistState && checkedArray.length !== table.data.length) {
                checkedArray = table.data.map(() => false);
            }

            await database.update(table._id, {
                checklist: newChecklistState,
                checked: checkedArray
            });
            menu.classList.add('hidden');
            await renderTables();
        });

        // Separator
        const separator1 = document.createElement('div');
        separator1.className = 'options-menu-separator';

        // 3. Move to Favs/Recents (context-aware)
        let moveBtn1;
        if (table.type === 'recents') {
            moveBtn1 = document.createElement('button');
            moveBtn1.className = 'options-menu-item';
            moveBtn1.innerHTML = '<span>Add to Favs</span>';
            moveBtn1.addEventListener('click', async () => {
                await database.update(table._id, { type: 'starred', pinned: false });
                menu.classList.add('hidden');
                await renderTables();
            });
        } else if (table.type === 'starred') {
            moveBtn1 = document.createElement('button');
            moveBtn1.className = 'options-menu-item';
            moveBtn1.innerHTML = '<span>Move to Recents</span>';
            moveBtn1.addEventListener('click', async () => {
                await database.update(table._id, { type: 'recent', pinned: false });
                menu.classList.add('hidden');
                await renderTables();
            });
        } else { // archives
            moveBtn1 = document.createElement('button');
            moveBtn1.className = 'options-menu-item';
            moveBtn1.innerHTML = '<span>Move to Recents</span>';
            moveBtn1.addEventListener('click', async () => {
                await database.update(table._id, { type: 'recent', pinned: false });
                menu.classList.add('hidden');
                await renderTables();
            });
        }

        // 4. Send to Archives/Add to Favs (context-aware)
        let moveBtn2;
        if (table.type === 'archives') {
            moveBtn2 = document.createElement('button');
            moveBtn2.className = 'options-menu-item';
            moveBtn2.innerHTML = '<span>Add to Favs</span>';
            moveBtn2.addEventListener('click', async () => {
                await database.update(table._id, { type: 'starred', pinned: false });
                menu.classList.add('hidden');
                await renderTables();
            });
        } else {
            moveBtn2 = document.createElement('button');
            moveBtn2.className = 'options-menu-item';
            moveBtn2.innerHTML = '<span>Send to Archives</span>';
            moveBtn2.addEventListener('click', async () => {
                await database.update(table._id, { type: 'archives', pinned: false });
                menu.classList.add('hidden');
                await renderTables();
            });
        }

        // Separator
        const separator2 = document.createElement('div');
        separator2.className = 'options-menu-separator';

        // 5. Delete Last Row
        const deleteRowBtn = document.createElement('button');
        deleteRowBtn.className = 'options-menu-item';
        deleteRowBtn.innerHTML = '<span>Delete Last Row</span>';
        deleteRowBtn.addEventListener('click', async () => {
            // Fetch fresh table data to avoid stale closure
            const tables = await database.getAll();
            const freshTable = tables.find(t => t._id === table._id);

            if (!freshTable) return;

            if (freshTable.data.length <= 1) {
                showConfirmation('Cannot delete the last remaining row.', () => { });
                menu.classList.add('hidden');
                return;
            }

            // Check if last row has data
            const lastRow = freshTable.data[freshTable.data.length - 1];
            const hasData = lastRow.some(cell => cell.trim() !== '');

            if (hasData) {
                showConfirmation('Last row contains data. Delete anyway?', async () => {
                    const newData = freshTable.data.slice(0, -1);
                    const updates = { data: newData };

                    // If in checklist mode, also remove last checked state
                    if (freshTable.checklist && freshTable.checked) {
                        updates.checked = freshTable.checked.slice(0, -1);
                    }

                    await database.update(freshTable._id, updates);
                    await renderTables();
                });
            } else {
                const newData = freshTable.data.slice(0, -1);
                const updates = { data: newData };

                // If in checklist mode, also remove last checked state
                if (freshTable.checklist && freshTable.checked) {
                    updates.checked = freshTable.checked.slice(0, -1);
                }

                await database.update(freshTable._id, updates);
                await renderTables();
            }
            menu.classList.add('hidden');
        });

        // 6. Delete Table
        const deleteTableBtn = document.createElement('button');
        deleteTableBtn.className = 'options-menu-item danger';
        deleteTableBtn.innerHTML = '<span>Delete Table</span>';
        deleteTableBtn.addEventListener('click', () => {
            showConfirmation(`Delete table "${table.name}"? This cannot be undone.`, async () => {
                await database.delete(table._id);
                await renderTables();
            });
            menu.classList.add('hidden');
        });

        // Assemble menu
        menu.appendChild(pinBtn);
        menu.appendChild(columnControl);
        menu.appendChild(checklistToggleItem);
        menu.appendChild(separator1);
        menu.appendChild(moveBtn1);
        menu.appendChild(moveBtn2);
        menu.appendChild(separator2);
        menu.appendChild(deleteRowBtn);
        menu.appendChild(deleteTableBtn);

        return menu;
    }


    /**
     * Save cell data to database
     */
    async function saveCellData(tableId, rowIndex, colIndex, value) {
        // Get current table data
        const tables = await database.getAll();
        const table = tables.find(t => t._id === tableId);

        if (!table) return;

        // Update the specific cell
        table.data[rowIndex][colIndex] = value;

        // Save to database
        await database.update(tableId, { data: table.data });
    }

    /**
     * Add a new row to the table
     */
    async function addNewRow(tableId, tableGrid, columnCount) {
        const tables = await database.getAll();
        const table = tables.find(t => t._id === tableId);

        if (!table) return;

        // Add new empty row
        const newRow = Array(table.columns).fill('');
        table.data.push(newRow);

        // If in checklist mode, also add unchecked state
        if (table.checklist) {
            if (!table.checked) table.checked = [];
            table.checked.push(false);
        }

        // Save to database
        await database.update(tableId, {
            data: table.data,
            ...(table.checklist && { checked: table.checked })
        });

        // Re-render to ensure consistent state
        await renderTables();
    }

    // Initial render
    await renderTables();
});

