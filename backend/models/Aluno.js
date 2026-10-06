const mongoose = require('mongoose');

const isInteger = {
  validator: Number.isInteger,
  message: '{PATH} must be a whole number'
};

const alunoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  apelido: { type: String, required: true, trim: true },
  idCurso: { type: Number, required: true },
  anoCurricular: {
    type: Number,
    required: true,
    min: [1, 'anoCurricular must be at least 1'],
    max: [6, 'anoCurricular must be at most 6'],
    validate: isInteger
  },
  idade: {
    type: Number,
    required: true,
    min: [15, 'idade must be at least 15'],
    max: [100, 'idade must be at most 100'],
    validate: isInteger
  }
});

module.exports = mongoose.model('Aluno', alunoSchema);