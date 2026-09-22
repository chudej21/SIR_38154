const Aluno = require('../models/Aluno');

// GET all students
exports.getAll = async (req, res) => {
  try {
    const alunos = await Aluno.find();
    res.json(alunos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single student by id
exports.getById = async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.id);
    if (!aluno) return res.status(404).json({ error: 'Aluno not found' });
    res.json(aluno);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create new student
exports.create = async (req, res) => {
  try {
    const novoAluno = new Aluno(req.body);
    const saved = await novoAluno.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update existing student
exports.update = async (req, res) => {
  try {
    const updated = await Aluno.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Aluno not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE student
exports.remove = async (req, res) => {
  try {
    const deleted = await Aluno.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Aluno not found' });
    res.json({ message: 'Aluno deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};