const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alunos API',
      version: '1.0.0',
      description: 'RESTful API for managing students and courses'
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local server' },
      { url: 'https://restapi-backend-67yt.onrender.com', description: 'Production server' }
    ]
  },
  apis: ['./backend/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;