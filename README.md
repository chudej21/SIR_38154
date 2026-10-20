# T_TRAB_RESTAPI

### Deployment Links

- **Front-end (Vercel):** https://t-trab-restapi.vercel.app/
- **Real API (Render):** https://restapi-backend-67yt.onrender.com

### Project Structure

- `/mock-data/` - bd.json original database
- `/mock-server/` - JSON-server configuration (see package.json "mock" script)
- `/tests/` - Postman collection
- `/frontend/` - Web interface (HTML/CSS/JS with Fetch API)
- `/backend/` - RESTful API with Node.js + Express + MongoDB Atlas (Mongoose, MVC structure)

### Running locally

**Mock API:**

    npm run mock

**Real API (requires .env with MONGO_URI):**

    npm start

**Frontend:** open `frontend/index.html` in a browser (make sure the API is running).
