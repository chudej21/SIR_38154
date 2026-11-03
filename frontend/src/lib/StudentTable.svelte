<script>
  // alunos: students, cursoNames: { idCurso: name }, onedit(aluno), ondelete(aluno)
  let { alunos, cursoNames, onedit, ondelete } = $props();
</script>

<div class="overflow-x-auto rounded-xl bg-white shadow-sm">
  <table class="w-full border-collapse text-left text-sm">
    <thead>
      <tr class="bg-blue-600 text-white">
        <th class="px-3 py-2.5 font-semibold">First Name</th>
        <th class="px-3 py-2.5 font-semibold">Last Name</th>
        <th class="px-3 py-2.5 font-semibold">Course</th>
        <th class="px-3 py-2.5 font-semibold">Year</th>
        <th class="px-3 py-2.5 font-semibold">Age</th>
        <th class="px-3 py-2.5 font-semibold">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each alunos as aluno (aluno._id)}
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="px-3 py-2.5">{aluno.nome}</td>
          <td class="px-3 py-2.5">{aluno.apelido}</td>
          <td class="px-3 py-2.5">{cursoNames[aluno.idCurso] ?? aluno.idCurso}</td>
          <td class="px-3 py-2.5">{aluno.anoCurricular}</td>
          <td class="px-3 py-2.5">{aluno.idade ?? ''}</td>
          <td class="whitespace-nowrap px-3 py-2.5">
            <button
              type="button"
              onclick={() => onedit(aluno)}
              class="mr-1 rounded bg-amber-500 px-2.5 py-1 text-white hover:bg-amber-600"
            >
              Edit
            </button>
            <button
              type="button"
              onclick={() => ondelete(aluno)}
              class="rounded bg-red-500 px-2.5 py-1 text-white hover:bg-red-600"
            >
              Delete
            </button>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="6" class="px-3 py-6 text-center text-slate-500">No students yet.</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
