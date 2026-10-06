const Curso = require('../models/Curso');

// GET all courses
exports.getAll = async (req, res) => {
  try {
    const cursos = await Curso.find();
    res.json(cursos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET one course by MongoDB _id
exports.getById = async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ error: 'Curso not found' });
    res.json(curso);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST create a course (idCurso is generated if not provided)
exports.create = async (req, res) => {
  try {
    let { idCurso, nomeDoCurso } = req.body;

    if (!nomeDoCurso) {
      return res.status(400).json({ error: 'nomeDoCurso is required' });
    }

    if (idCurso === undefined || idCurso === null) {
      const last = await Curso.findOne().sort({ idCurso: -1 });
      idCurso = last ? last.idCurso + 1 : 1;
    }

    const curso = new Curso({ idCurso, nomeDoCurso });
    await curso.save();
    res.status(201).json(curso);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update a course by MongoDB _id
exports.update = async (req, res) => {
  try {
    const curso = await Curso.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!curso) return res.status(404).json({ error: 'Curso not found' });
    res.json(curso);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE a course by MongoDB _id
exports.remove = async (req, res) => {
  try {
    const curso = await Curso.findByIdAndDelete(req.params.id);
    if (!curso) return res.status(404).json({ error: 'Curso not found' });
    res.json({ message: 'Curso deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};