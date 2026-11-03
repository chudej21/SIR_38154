<script>
  import { onMount } from 'svelte';
  import * as api from './lib/api.js';
  import CourseManager from './lib/CourseManager.svelte';
  import StudentForm from './lib/StudentForm.svelte';
  import StudentTable from './lib/StudentTable.svelte';

  let alunos = $state([]);
  let cursos = $state([]);
  let editing = $state(null); // student currently being edited, or null
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let retryable = $state(false); // show the Retry button (only for failed data loading)

  // idCurso -> course name, used by the table
  let cursoNames = $derived(Object.fromEntries(cursos.map((c) => [c.idCurso, c.nomeDoCurso])));
  // next free idCurso for a new course
  let nextIdCurso = $derived(Math.max(0, ...cursos.map((c) => c.idCurso)) + 1);

  async function loadCursos() {
    cursos = await api.getCursos();
  }

  async function loadAlunos() {
    alunos = await api.getAlunos();
  }

  // Runs an API action, shows the error message (if any) and returns true/false
  async function run(action, canRetry = false) {
    error = '';
    retryable = false;
    try {
      await action();
      return true;
    } catch (e) {
      error = e.message;
      retryable = canRetry;
      return false;
    }
  }

  async function loadAll() {
    loading = true;
    await run(() => Promise.all([loadCursos(), loadAlunos()]), true);
    loading = false;
  }

  onMount(loadAll);

  async function saveAluno(data) {
    saving = true;
    const ok = await run(async () => {
      if (editing) {
        await api.updateAluno(editing._id, data);
      } else {
        await api.createAluno(data);
      }
      await loadAlunos();
    });
    saving = false;
    if (ok) editing = null;
    return ok;
  }

  function startEdit(aluno) {
    editing = aluno;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeAluno(aluno) {
    if (!confirm(`Delete ${aluno.nome} ${aluno.apelido}?`)) return;
    const ok = await run(async () => {
      await api.deleteAluno(aluno._id);
      await loadAlunos();
    });
    if (ok && editing?._id === aluno._id) editing = null;
  }

  async function addCurso(nomeDoCurso) {
    return run(async () => {
      await api.createCurso({ idCurso: nextIdCurso, nomeDoCurso });
      await loadCursos();
    });
  }

  // The API refuses (409) to delete a course that still has students
  async function removeCurso(curso) {
    if (!confirm(`Delete the course "${curso.nomeDoCurso}"?`)) return;
    await run(async () => {
      await api.deleteCurso(curso._id);
      await loadCursos();
      await loadAlunos();
    });
  }
</script>

<main class="mx-auto max-w-4xl px-4 py-10">
  <h1 class="mb-6 text-3xl font-bold text-slate-900">Student Management</h1>

  {#if error}
    <div class="mb-6 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <span>{error}</span>
      <div class="flex shrink-0 gap-3">
        {#if retryable}
          <button type="button" onclick={loadAll} class="font-medium underline">Retry</button>
        {/if}
        <button type="button" onclick={() => (error = '')} aria-label="Dismiss" class="font-medium">×</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <p class="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      Loading… the free server may need up to a minute to wake up.
    </p>
  {:else}
    <CourseManager {cursos} onadd={addCurso} ondelete={removeCurso} />
    <StudentForm {cursos} {editing} {saving} onsave={saveAluno} oncancel={() => (editing = null)} />
    <StudentTable {alunos} {cursoNames} onedit={startEdit} ondelete={removeAluno} />
  {/if}
</main>
