const express = require('express');
const router = express.Router();
const alunosController = require('../controllers/alunosController');

/**
 * @swagger
 * tags:
 *   name: Alunos
 *   description: Student management endpoints
 */

/**
 * @swagger
 * /alunos:
 *   get:
 *     summary: Get all students
 *     tags: [Alunos]
 *     responses:
 *       200:
 *         description: List of students
 */
router.get('/', alunosController.getAll);

/**
 * @swagger
 * /alunos/{id}:
 *   get:
 *     summary: Get a student by ID
 *     tags: [Alunos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student found
 *       404:
 *         description: Student not found
 */
router.get('/:id', alunosController.getById);

/**
 * @swagger
 * /alunos:
 *   post:
 *     summary: Create a new student
 *     tags: [Alunos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               apelido:
 *                 type: string
 *               idCurso:
 *                 type: number
 *               anoCurricular:
 *                 type: number
 *               idade:
 *                 type: number
 *     responses:
 *       201:
 *         description: Student created
 */
router.post('/', alunosController.create);

/**
 * @swagger
 * /alunos/{id}:
 *   put:
 *     summary: Update an existing student
 *     tags: [Alunos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               apelido:
 *                 type: string
 *               idCurso:
 *                 type: number
 *               anoCurricular:
 *                 type: number
 *               idade:
 *                 type: number
 *     responses:
 *       200:
 *         description: Student updated
 *       404:
 *         description: Student not found
 */
router.put('/:id', alunosController.update);

/**
 * @swagger
 * /alunos/{id}:
 *   delete:
 *     summary: Delete a student
 *     tags: [Alunos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student deleted
 *       404:
 *         description: Student not found
 */
router.delete('/:id', alunosController.remove);

module.exports = router;