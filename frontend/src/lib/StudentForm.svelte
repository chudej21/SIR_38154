<script>
  import { englishValidation } from './validation.js';

  // cursos: courses for the dropdown, editing: student being edited (or null),
  // onsave(data): returns true on success, oncancel(): leave edit mode
  let { cursos, editing = null, saving = false, onsave, oncancel } = $props();

  let nome = $state('');
  let apelido = $state('');
  let idCurso = $state('');
  let anoCurricular = $state(null);
  let idade = $state(null);

  function resetFields() {
    nome = '';
    apelido = '';
    idCurso = '';
    anoCurricular = null;
    idade = null;
  }

  // Click on "Edit" fills the form; leaving edit mode clears it
  $effect(() => {
    if (editing) {
      nome = editing.nome;
      apelido = editing.apelido;
      idCurso = editing.idCurso;
      anoCurricular = editing.anoCurricular;
      idade = editing.idade;
    } else {
      resetFields();
    }
  });

  async function submit(e) {
    e.preventDefault();
    const ok = await onsave({
      nome: nome.trim(),
      apelido: apelido.trim(),
      idCurso: Number(idCurso),
      anoCurricular: Number(anoCurricular),
      idade: Number(idade),
    });
    // Clear the form after a successful save (after an edit, leaving edit mode clears it too)
    if (ok) resetFields();
  }

  const inputClass =
    'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';
</script>

<form onsubmit={submit} class="mb-8 grid grid-cols-1 gap-3 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2">
  <h2 class="text-lg font-semibold text-slate-800 sm:col-span-2">
    {editing ? 'Edit Student' : 'Student'}
  </h2>

  <input type="text" bind:value={nome} use:englishValidation placeholder="First name" required class={inputClass} />
  <input type="text" bind:value={apelido} use:englishValidation placeholder="Last name" required class={inputClass} />

  <select bind:value={idCurso} use:englishValidation required class={inputClass}>
    <option value="" disabled>Select course</option>
    {#each cursos as curso (curso._id)}
      <option value={curso.idCurso}>{curso.nomeDoCurso}</option>
    {/each}
  </select>

  <input
    type="number"
    bind:value={anoCurricular}
    use:englishValidation
    placeholder="Academic year (1-6)"
    min="1"
    max="6"
    step="1"
    required
    class={inputClass}
  />
  <input
    type="number"
    bind:value={idade}
    use:englishValidation
    placeholder="Age (15-100)"
    min="15"
    max="100"
    step="1"
    required
    class={inputClass}
  />

  <div class="flex gap-2 sm:col-span-2">
    <button
      type="submit"
      disabled={saving}
      class="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {editing ? 'Save Changes' : 'Add Student'}
    </button>
    {#if editing}
      <button
        type="button"
        onclick={oncancel}
        class="rounded-md bg-slate-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-600"
      >
        Cancel Edit
      </button>
    {/if}
  </div>
</form>
