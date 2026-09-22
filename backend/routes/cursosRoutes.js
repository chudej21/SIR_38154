const express = require('express');
const router = express.Router();
const cursosController = require('../controllers/cursosController');

/**
 * @swagger
 * tags:
 *   name: Cursos
 *   description: Course endpoints (read-only)
 */

/**
 * @swagger
 * /cursos:
 *   get:
 *     summary: Get all courses
 *     tags: [Cursos]
 *     responses:
 *       200:
 *         description: List of courses
 */
router.get('/', cursosController.getAll);

module.exports = router;