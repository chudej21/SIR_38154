const mongoose = require('mongoose');

const alunoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  apelido: { type: String, required: true },
  idCurso: { type: Number, required: true },
  anoCurricular: { type: Number, required: true },
  idade: { type: Number }
});

module.exports = mongoose.model('Aluno', alunoSchema);