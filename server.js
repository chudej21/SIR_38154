require('dotenv').config();
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./backend/docs/swagger');

const alunosRoutes = require('./backend/routes/alunosRoutes');
const cursosRoutes = require('./backend/routes/cursosRoutes');
const { attachChat } = require('./backend/socket/chat');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/alunos', alunosRoutes);
app.use('/cursos', cursosRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => {
  res.send('API is running');
});

const PORT = process.env.PORT || 5000;

// One HTTP server for both the REST API and the Socket.io chat
const server = http.createServer(app);
attachChat(server, app);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    server.listen(PORT, () => console.log(`Server running on port ${PORT} (REST API + Socket.io chat)`));
  })
  .catch(err => console.error('MongoDB connection error:', err));