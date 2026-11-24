# Student Management – REST API + Svelte frontend

Full-stack app for managing students (`alunos`) and courses (`cursos`).

- **Backend:** Node.js + Express + Mongoose (MVC) + MongoDB Atlas, documented with Swagger
- **Frontend:** Svelte 5 + Tailwind CSS 4, built with Vite
- **Mock API:** JSON-Server (for testing before the real API existed)

## Live links

| What | URL |
| --- | --- |
| Frontend (Vercel) | https://t-trab-restapi.vercel.app/ |
| Real API (Render) | https://restapi-backend-67yt.onrender.com |
| Swagger docs | https://restapi-backend-67yt.onrender.com/api-docs/ |
| Socket.io chat | https://t-trab-restapi.vercel.app/#socket (server: same Render service as the API) |

> The API runs on Render's free tier and goes to sleep after inactivity. The first request can take up to a minute; the frontend shows a loading message while the server wakes up.

## Project structure

```text
├── frontend/       Svelte + Tailwind web interface (Vite)
│   └── src/        App.svelte and components in src/lib/
├── backend/
│   ├── models/       Mongoose schemas (Aluno, Curso)
│   ├── controllers/  Request handling
│   ├── routes/       Express routes with Swagger comments
│   └── docs/         Swagger configuration
├── mock-data/      bd.json – original JSON database
├── mock-server/    JSON-Server configuration (see "mock" script in package.json)
├── tests/          Postman collection
├── server.js       API entry point
└── README.md
```

## Running locally

Requirements: **Node.js 20.19 or newer** and a MongoDB Atlas connection string.

### 1. Backend (real API)

```bash
npm install
```

Create a `.env` file in the project root (it is git-ignored):

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/restapi
PORT=5000
```

```bash
npm start
```

- API: http://localhost:5000/alunos and http://localhost:5000/cursos
- Swagger: http://localhost:5000/api-docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the address printed by Vite (usually http://localhost:5173).

By default the frontend talks to the API deployed on Render. To use your local backend instead, create `frontend/.env.local` (git-ignored):

```env
VITE_API_URL=http://localhost:5000
```

Production build: `npm run build` (output in `frontend/dist`).

### 3. Socket.io chat

The chat runs on the same server as the REST API (`backend/socket/chat.js`, attached in `server.js`), so `npm start` starts both.
The frontend connects to the Render API by default; for local development set `VITE_API_URL=http://localhost:5000` in `frontend/.env.local` (or `VITE_SOCKET_URL` to use a different chat server).

Features (modelled on Instagram direct messages):

- **Unique nicknames** – checked while typing (`GET /chat/name-available?name=…`) and again on connect
- **Groups** – create, switch, delete (only the creator; members are moved back to *General*)
- **Private chats (DMs)** – click a user under *Active now*; only the two people can see the chat
- **Typing indicator**, **Seen / Seen by …** under your last message
- **Reactions** – ❤️ 😂 😮 😢 😡 👍, one per person, double-click a message for ❤️
- **Reply** to a specific message, **edit** your message (15 minutes), **unsend** your message
- **Unread counters** per chat and an **online users** list

Everything is kept in memory, so groups, chats and messages disappear when the server restarts (Render's free tier restarts it after inactivity).
Optional: set `CLIENT_ORIGIN` (comma separated) on the server to restrict which websites may connect.

`socket-server/` is the original standalone version of the chat (port 4000), kept for reference.

### 4. Mock API (optional)

```bash
npm run mock
```

Serves `mock-data/bd.json` on http://localhost:3001.

## API endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/alunos` | List all students |
| GET | `/alunos/:id` | Get one student |
| POST | `/alunos` | Create a student |
| PUT | `/alunos/:id` | Update a student |
| DELETE | `/alunos/:id` | Delete a student |
| GET | `/cursos` | List all courses |
| GET | `/cursos/:id` | Get one course |
| POST | `/cursos` | Create a course (`idCurso` is generated if omitted) |
| PUT | `/cursos/:id` | Update a course |
| DELETE | `/cursos/:id` | Delete a course (409 if students are still assigned) |

Validation: `anoCurricular` must be a whole number from 1 to 6 and `idade` a whole number from 15 to 100. Invalid data returns `400` with an error message.

## What the frontend does

- Add, edit and delete students; add and delete courses
- Course names are shown in the students table (looked up from `idCurso`)
- Form validation with English messages, both in the browser and in the API
- Errors from the API (for example "course still has students") are shown in a banner
- Responsive layout styled with Tailwind CSS utility classes

## Use of AI

Claude (Anthropic) was used as a coding assistant, for example for the Svelte/Tailwind rewrite of the frontend and for the course endpoints. The generated code was reviewed, run and tested before being committed.
