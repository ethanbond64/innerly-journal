## Innerly
An open source multimedia journal that can be self hosted. Features include secured notes, autosaving while typinh, link saving with automatic thumbnail downloads, and uploaded file hosting. A screenshot of the main journal page layout is shown below.

![Example innerly homepage showing entries in chronological order](/innerly-example.png)

![Innerly writing page](/innerly-write.png)

### Quickstart
Requires docker-compose. First run the setup script, then docker-compose:
```
./setup.sh
docker-compose up --build
```
Then open http://localhost:8000. A single container builds the frontend and serves
it alongside the API, so there is no separate frontend service or port.

### Development
The image has to be rebuilt to pick up frontend changes, so for iterative work run
the Vite dev server against the container instead. It proxies `/api` to the backend,
keeping requests same-origin:
```
docker-compose up            # API + built frontend on :8000
cd frontend && npm install && npm run start   # dev server with hot reload on :3000
```
Set `VITE_API_TARGET` if the backend is not on `http://localhost:8000`.

