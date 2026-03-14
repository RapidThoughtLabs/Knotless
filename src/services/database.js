import Datastore from 'nedb';
import path from 'path';
import fs from 'fs';

class DatabaseService {
    constructor(userDataPath) {
        // Initialize NeDB with persistence to user data directory
        const dbPath = path.join(userDataPath, 'tables.db');

        // Ensure directory exists (Windows may need this)
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir, { recursive: true });
            } catch (error) {
                console.error('Failed to create database directory:', error);
                if (process.platform === 'win32' && error.code === 'EACCES') {
                    throw new Error('Permission denied. Cannot create database directory. Please check file permissions.');
                }
                throw error;
            }
        }

        this.db = new Datastore({
            filename: dbPath,
            autoload: true,
            timestampData: true // Automatically add createdAt and updatedAt
        });

        // Second datastore for sheets
        const sheetsDbPath = path.join(userDataPath, 'sheets.db');
        this.sheetsDb = new Datastore({
            filename: sheetsDbPath,
            autoload: true,
            timestampData: true
        });
    }

    // ── Sheets ──────────────────────────────────────────────────────────────────

    /**
     * Ensure at least one sheet exists. If the DB is empty, creates a default
     * "home" sheet. Does nothing if any sheets already exist.
     * @returns {Promise<Object|null>} The created home sheet doc, or null if sheets existed
     */
    ensureHomeSheet() {
        return new Promise((resolve, reject) => {
            this.sheetsDb.count({}, (err, count) => {
                if (err) return reject(err);
                if (count > 0) return resolve(null);
                this.sheetsDb.insert(
                    { name: 'home', createdAt: new Date(), updatedAt: new Date() },
                    (err, newDoc) => {
                        if (err) reject(err);
                        else resolve(newDoc);
                    }
                );
            });
        });
    }

    /**
     * Create a new sheet
     * @param {string} name
     * @returns {Promise<Object>} Created sheet doc
     */
    createSheet(name) {
        return new Promise((resolve, reject) => {
            this.sheetsDb.insert(
                { name, createdAt: new Date(), updatedAt: new Date() },
                (err, doc) => {
                    if (err) reject(err);
                    else resolve(doc);
                }
            );
        });
    }

    /**
     * Get all sheets sorted by createdAt ascending (home first)
     * @returns {Promise<Array>}
     */
    getAllSheets() {
        return new Promise((resolve, reject) => {
            this.sheetsDb.find({}).sort({ createdAt: 1 }).exec((err, docs) => {
                if (err) reject(err);
                else resolve(docs);
            });
        });
    }

    /**
     * Delete a sheet by id
     * @param {string} id
     * @returns {Promise<number>} Number of docs removed
     */
    deleteSheet(id) {
        return new Promise((resolve, reject) => {
            this.sheetsDb.remove({ _id: id }, {}, (err, numRemoved) => {
                if (err) reject(err);
                else resolve(numRemoved);
            });
        });
    }

    /**
     * Rename a sheet
     * @param {string} id
     * @param {string} newName
     * @returns {Promise<number>} Number of docs updated
     */
    renameSheet(id, newName) {
        return new Promise((resolve, reject) => {
            this.sheetsDb.update(
                { _id: id },
                { $set: { name: newName, updatedAt: new Date() } },
                {},
                (err, numUpdated) => {
                    if (err) reject(err);
                    else resolve(numUpdated);
                }
            );
        });
    }

    // ── Tables ───────────────────────────────────────────────────────────────────

    /**
     * Create a new table
     * @param {Object} tableData - { name, sheetId, columns, data, ... }
     * @returns {Promise<Object>} Created table with _id
     */
    createTable(tableData) {
        return new Promise((resolve, reject) => {
            const newTable = {
                name: tableData.name || 'Untitled Table',
                sheetId: tableData.sheetId,
                columns: tableData.columns || 3,
                data: tableData.data || [['', '', '']],
                pinned: tableData.pinned || false,
                checklist: tableData.checklist || false,
                checked: tableData.checked || [],
                highlights: tableData.highlights || {},
                sortOrder: tableData.sortOrder || Date.now(),
                cardHeight: tableData.cardHeight || null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.db.insert(newTable, (err, doc) => {
                if (err) reject(err);
                else resolve(doc);
            });
        });
    }

    /**
     * Get all tables
     * @returns {Promise<Array>} All tables sorted by updatedAt (newest first)
     */
    getAllTables() {
        return new Promise((resolve, reject) => {
            this.db.find({}).sort({ updatedAt: -1 }).exec((err, docs) => {
                if (err) reject(err);
                else resolve(docs);
            });
        });
    }

    /**
     * Get tables belonging to a sheet
     * @param {string} sheetId
     * @returns {Promise<Array>} Tables sorted by pinned, sortOrder, createdAt
     */
    getTablesBySheetId(sheetId) {
        return new Promise((resolve, reject) => {
            this.db.find({ sheetId })
                .sort({ pinned: -1, sortOrder: -1, createdAt: -1 })
                .exec((err, docs) => {
                    if (err) reject(err);
                    else resolve(docs);
                });
        });
    }

    /**
     * Update a table
     * @param {String} id - Table _id
     * @param {Object} updates - Fields to update
     * @returns {Promise<Number>} Number of documents updated
     */
    updateTable(id, updates) {
        return new Promise((resolve, reject) => {
            updates.updatedAt = new Date();
            this.db.update({ _id: id }, { $set: updates }, {}, (err, numReplaced) => {
                if (err) reject(err);
                else resolve(numReplaced);
            });
        });
    }

    /**
     * Delete a table
     * @param {String} id - Table _id
     * @returns {Promise<Number>} Number of documents deleted
     */
    deleteTable(id) {
        return new Promise((resolve, reject) => {
            this.db.remove({ _id: id }, {}, (err, numRemoved) => {
                if (err) reject(err);
                else resolve(numRemoved);
            });
        });
    }
}

export default DatabaseService;
