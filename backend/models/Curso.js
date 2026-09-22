const mongoose = require('mongoose');

const cursoSchema = new mongoose.Schema({
  idCurso: { type: Number, required: true, unique: true },
  nomeDoCurso: { type: String, required: true }
});

module.exports = mongoose.model('Curso', cursoSchema);