import Datastore from 'nedb';
import path from 'path';
import { app } from 'electron';

class DatabaseService {
    constructor() {
        // Initialize NeDB with persistence to user data directory
        const dbPath = path.join(app.getPath('userData'), 'tables.db');
        this.db = new Datastore({
            filename: dbPath,
            autoload: true,
            timestampData: true // Automatically add createdAt and updatedAt
        });
    }

    /**
     * Create a new table
     * @param {Object} tableData - { name, type, columns, data }
     * @returns {Promise<Object>} Created table with _id
     */
    createTable(tableData) {
        return new Promise((resolve, reject) => {
            const newTable = {
                name: tableData.name || 'Untitled Table',
                type: tableData.type || 'recent',
                columns: tableData.columns || 3,
                data: tableData.data || [['', '', '']],
                pinned: tableData.pinned || false,
                checklist: tableData.checklist || false,
                checked: tableData.checked || [],
                highlights: tableData.highlights || {},
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
     * Get tables filtered by type
     * @param {String} type - 'recent', 'starred', or 'archived'
     * @returns {Promise<Array>} Filtered tables
     */
    getTablesByType(type) {
        return new Promise((resolve, reject) => {
            this.db.find({ type }).sort({ pinned: -1, createdAt: -1 }).exec((err, docs) => {
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
