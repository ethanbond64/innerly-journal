# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Innerly is an open-source multimedia journal application that can be self-hosted or run as an Electron desktop app. It features secured notes with encryption, autosaving while typing, link saving with automatic thumbnail downloads, and uploaded file hosting.

## Architecture

### Deployment Modes

The application supports two deployment modes:

1. **Docker Mode (Web)**: Frontend and backend run as separate services via docker-compose
2. **Electron Desktop App**: Packaged as a standalone desktop application with embedded backend

### Backend (Python/Flask)

- **Framework**: Flask 3.0.2 with Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS
- **Entry Point**: `backend/entrypoint.py` → `backend/api/app.py:create_app()`
- **Database**: SQLAlchemy with support for PostgreSQL and SQLite (configured via settings)
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **API Structure**: RESTful API exposed at `/api/*` endpoints via Blueprint

**Key Backend Components**:

- `backend/api/models.py`: Database models (User, Entry, Tag, EntryTagXref)
- `backend/api/views.py`: All API route handlers
- `backend/api/security.py`: Authentication, password encryption/validation, text encryption for locked entries
- `backend/api/processors/`: Entry processors for different content types
  - `text_processor.py`: Handles text entries with sentiment analysis
  - `file_processor.py`: Handles file uploads (images only: jpg, png, gif)
  - `link_processor.py`: Fetches OpenGraph metadata and downloads thumbnails
- `backend/api/settings.py`: Configuration loading from environment variables

**Database Schema**:
- Users have email/password_hash, admin flag, settings JSON, usage JSON
- Entries belong to users, have entry_type ('text'|'file'|'link'), entry_data JSON, functional_datetime
- Tags are user-scoped with many-to-many relationship to entries via EntryTagXref
- Entry data JSON structure varies by type but includes locked status, sentiment, text content, file paths, etc.

**File Storage**: User files stored at `~/.innerly/static/user-{user_id}/` by default

**Sentiment Analysis**: Built-in keyword-based sentiment analysis (positive/negative/neutral) in `text_processor.py` using keyword lists

### Frontend (React)

- **Framework**: React 18.2.0 with React Router 6.22.3
- **Build Tool**: react-scripts (Create React App)
- **Structure**: Component-based architecture with page components in `src/`
- **State Management**: React hooks (useState, useEffect) - no Redux

**Key Frontend Components**:

- `frontend/src/app.js`: Main app component with routing
- `frontend/src/navbar.js`: Navigation component
- `frontend/src/home-page.js`: Entry list view
- `frontend/src/view-page.js`: Individual entry display with lock/unlock, edit title/sentiment
- `frontend/src/write-page.js`: Text entry creation/editing with autosave
- `frontend/src/login-page.js` & `frontend/src/sign-up-page.js`: Authentication flows
- `frontend/src/settings-page.js`: User settings management
- `frontend/src/requests.js`: All API call functions using axios
- `frontend/src/cards/`: Card components for different entry types (text, file, link)
- `frontend/src/dark-mode.js`: Dark mode toggle functionality

**Autosave Mechanism**: Write page uses a 3-second debounce on text changes to automatically save entries

**Entry Locking**: Entries can be password-locked, encrypting the text content using user's email as key

### Electron Integration

- **Main Process**: `frontend/public/electron.js` spawns the backend Python process and creates BrowserWindow
- The backend is compiled into a standalone executable via PyInstaller
- Frontend loads from `http://localhost:3000#login` in development

## Common Development Tasks

### Docker Development (Web Mode)

```bash
# Start all services (frontend on :3000, backend on :8000)
docker-compose up --build

# Backend only
docker-compose up --build server

# Frontend only
docker-compose up --build frontend
```

### Local Development (Frontend)

```bash
cd frontend
npm install
npm start          # Development server on port 3000
npm test           # Run tests
npm run build      # Production build
```

### Building Electron Desktop App

```bash
# Build backend executable
cd backend
pyinstaller -F entrypoint.py  # Creates backend/dist/entrypoint
cd ..

# Build frontend and package Electron app
cd frontend
cp ../backend/dist/entrypoint ./public/entrypoint
npm run build     # Create production React build
npm run dist      # Package Electron app (macOS)
```

The `build.sh` script automates this process.

### Backend Development

The backend runs via gunicorn in Docker mode. For local development:

```bash
cd backend
# Setup virtual environment (if needed)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run locally
python entrypoint.py
```

## API Patterns

### Authentication Flow
1. User signs up or logs in → receives JWT token
2. Token stored in client and sent in Authorization header
3. `@login_required` decorator validates token and injects `current_user`

### Entry Types
- **text**: title, text content, sentiment (positive/neutral/negative), locked flag
- **file**: original_filename, path, file_type (image extension)
- **link**: title, path (downloaded thumbnail), original_path, file_type, link URL

### Entry Encryption
- Text entries can be locked with user password
- Uses `lock_text(email, text)` and `unlock_text(email, text)` in `security.py`
- Locked entries require password to view/edit

## Important Implementation Details

### First User is Admin
When the first user signs up, they are automatically assigned admin privileges (`backend/api/views.py:71`)

### Functional Datetime
Entries have both `created_on` (actual creation time) and `functional_datetime` (user-specified date for the entry). This allows "backdating" memories.

### Tag Handling
- Tags are extracted from text entries but mechanism is currently empty in `text_processor.py:16`
- Tags are stored lowercase and deduplicated per user
- Many-to-many relationship allows same tag across multiple entries

### File Upload Restrictions
Only image files (jpg, png, gif) are accepted. Validation uses both extension check and magic byte inspection.

### Search Functionality
Search in `backend/api/views.py:283` queries both entry titles and text content, but excludes locked entry text.

### CORS Configuration
Backend allows all origins (`resources={r"/*": {"origins": "*"}}`) - should be restricted in production

## Configuration

Environment variables loaded from `.env` file:

- Database connection settings
- JWT secret key
- INNERLY_DIRECTORY (default: `~/.innerly`)
- See `backend/api/settings.py` for all options

## Testing

Frontend uses Jest and React Testing Library:
```bash
cd frontend
npm test
```

No backend tests are currently implemented.
