# Knotless

A modern, minimalist note-taking application built with Electron, featuring table-based notes with embedded database storage.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

### 📊 Table-Based Notes
- **Spreadsheet-like interface** with editable cells
- **Auto-expanding rows** - type in the last row to automatically add more
- **Multiple columns** - organize your data with up to 3 columns (default)
- **Live auto-save** - changes persist automatically on blur

### 🗂️ Organization
- **Three categories**: Recents, Starred, and Archives
- **Filter dropdown** - quickly switch between categories
- **Editable table names** - rename tables on the fly
- **Persistent storage** - all data saved locally with NeDB

### 🎨 Design
- **Retro-minimalist aesthetic** with monochromatic gray theme
- **Frameless window** with platform-specific controls
- **JetBrains Mono typography** for a clean, terminal-inspired look
- **Native drag region** for window movement

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ruchitnannavare/Knotless.git
   cd Knotless
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

### Running the Application

#### 🖥️ macOS
```bash
npm run electron:dev
```

The app will launch with macOS traffic lights (● ● ●) in the top-left corner.

#### 🪟 Windows
```bash
npm run electron:dev
```

The app will launch with Windows-style window controls on the top-right.

#### 🐧 Linux
```bash
npm run electron:dev
```

The app will launch with standard window controls based on your desktop environment.

### Building for Production

To create a distributable package for your platform:

```bash
npm run electron:build
```

This will:
- Build the Vite bundle
- Package the Electron app using electron-builder
- Output platform-specific installers in the `dist` folder

## 📖 How to Use

### Creating a New Table

1. Click the **"+ add"** button in the top-right corner
2. Enter a name for your table (or leave blank for "Untitled Table")
3. Press **Enter** or click **"Add"**
4. Your new table appears in the "recents" category

### Editing Tables

- **Edit cells**: Click any cell and start typing
- **Save changes**: Press **Enter** or click outside the cell
- **Add rows**: Type in the last row - a new row will automatically appear
- **Rename table**: Click the table name in the footer and edit

### Organizing Tables

- **Filter by category**: Use the dropdown menu (# recents ▼) to switch between:
  - **recents**: Newly created tables
  - **starred**: Important tables (Phase 2)
  - **archives**: Stored tables (Phase 2)

### Keyboard Shortcuts

- **ESC**: Close modal dialogs
- **Enter**: Submit forms or exit cell edit mode
- **Tab**: Navigate between cells (browser default)

## 🗄️ Data Storage

Your tables are stored locally using NeDB (embedded NoSQL database):

- **macOS**: `~/Library/Application Support/noteless/tables.db`
- **Windows**: `%APPDATA%\noteless\tables.db`
- **Linux**: `~/.config/noteless/tables.db`

All data persists across application restarts.

## 🛠️ Technology Stack

- **[Electron](https://www.electronjs.org/)** v28.1.0 - Cross-platform desktop framework
- **[Vite](https://vitejs.dev/)** v5.0.11 - Fast development server and bundler
- **[NeDB](https://github.com/louischatriot/nedb)** - Embedded persistent database
- **ES Modules** - Modern JavaScript architecture

## 📋 Roadmap

### ✅ Phase 1 (Complete)
- [x] Core table editing functionality
- [x] Auto-save and auto-expand rows
- [x] Modal popup for creating tables
- [x] Category filtering (recents/starred/archives)
- [x] Retro-minimalist gray theme

### 🚧 Phase 2 (Planned)
- [ ] Three-dot options menu
- [ ] Star/unstar tables
- [ ] Archive/unarchive tables
- [ ] Delete tables
- [ ] Dynamic column management
- [ ] Checklist conversion mode
- [ ] Search within tables
- [ ] Export to CSV/JSON
- [ ] Table templates

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- 3-dot options menu is placeholder only (Phase 2)
- Starred and archives categories work for filtering but not assignment (Phase 2)

## 👤 Author

**Ruchit Nannavare**

---

*Built with ♥️ using Electron and Vite*
