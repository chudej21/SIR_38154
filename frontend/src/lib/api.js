// Base URL of the real API (Render). For local development create
// frontend/.env.local with:  VITE_API_URL=http://localhost:5000
const BASE = (import.meta.env.VITE_API_URL ?? 'https://restapi-backend-67yt.onrender.com').replace(/\/$/, '');

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      // Only send a Content-Type when there is a body (avoids needless CORS preflights)
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the API. The free Render server may be waking up (it can take up to a minute), please try again.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON response
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data;
}

// Students (alunos)
export const getAlunos = () => request('/alunos');
export const createAluno = (aluno) => request('/alunos', { method: 'POST', body: aluno });
export const updateAluno = (id, aluno) => request(`/alunos/${id}`, { method: 'PUT', body: aluno });
export const deleteAluno = (id) => request(`/alunos/${id}`, { method: 'DELETE' });

// Courses (cursos)
export const getCursos = () => request('/cursos');
export const createCurso = (curso) => request('/cursos', { method: 'POST', body: curso });
export const deleteCurso = (id) => request(`/cursos/${id}`, { method: 'DELETE' });
