
# Virtual environment
# python3 -m venv venv

# Activate virtual environment
# source venv/bin/activate
# pip install -Iv pyinstaller==6.6.0

# Build backend executable
cd backend
pyinstaller -F entrypoint.py
cd ..

# Build frontend executable
cd frontend

# Include backend script
cp ../backend/dist/entrypoint ../frontend/public/entrypoint

# Build frontend executable 
npm run build
npm run dist



