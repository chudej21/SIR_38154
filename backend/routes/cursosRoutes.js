const express = require('express');
const router = express.Router();
const cursosController = require('../controllers/cursosController');

/**
 * @swagger
 * tags:
 *   name: Cursos
 *   description: Course endpoints
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

/**
 * @swagger
 * /cursos/{id}:
 *   get:
 *     summary: Get a course by id
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the course
 *     responses:
 *       200:
 *         description: The course
 *       404:
 *         description: Course not found
 */
router.get('/:id', cursosController.getById);

/**
 * @swagger
 * /cursos:
 *   post:
 *     summary: Create a new course
 *     tags: [Cursos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nomeDoCurso
 *             properties:
 *               idCurso:
 *                 type: integer
 *                 example: 3
 *                 description: Optional, generated automatically if omitted
 *               nomeDoCurso:
 *                 type: string
 *                 example: Engenharia Informatica
 *     responses:
 *       201:
 *         description: Course created
 *       400:
 *         description: Invalid data
 */
router.post('/', cursosController.create);

/**
 * @swagger
 * /cursos/{id}:
 *   put:
 *     summary: Update a course
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the course
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idCurso:
 *                 type: integer
 *               nomeDoCurso:
 *                 type: string
 *     responses:
 *       200:
 *         description: Course updated
 *       404:
 *         description: Course not found
 */
router.put('/:id', cursosController.update);

/**
 * @swagger
 * /cursos/{id}:
 *   delete:
 *     summary: Delete a course
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the course
 *     responses:
 *       200:
 *         description: Course deleted
 *       404:
 *         description: Course not found
 *       409:
 *         description: Course still has students assigned
 */
router.delete('/:id', cursosController.remove);

module.exports = router;