<script>
  import { englishValidation } from './validation.js';

  // cursos: list of courses, onadd(name): create a course, ondelete(curso): delete one
  let { cursos, onadd, ondelete } = $props();

  let name = $state('');
  let adding = $state(false);

  async function submit(e) {
    e.preventDefault();
    adding = true;
    const ok = await onadd(name.trim());
    adding = false;
    if (ok) name = '';
  }
</script>

<section class="mb-8 rounded-xl bg-white p-5 shadow-sm">
  <h2 class="mb-3 text-lg font-semibold text-slate-800">Courses</h2>

  <form onsubmit={submit} class="mb-4 flex gap-2">
    <input
      type="text"
      bind:value={name}
      use:englishValidation
      placeholder="New course name"
      required
      class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
    <button
      type="submit"
      disabled={adding}
      class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Add Course
    </button>
  </form>

  <!-- Compact list: chips wrap onto several lines and scroll when there are many courses -->
  <div class="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
    {#each cursos as curso (curso._id)}
      <span class="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1.5 text-sm text-slate-800">
        {curso.nomeDoCurso}
        <button
          type="button"
          title="Delete course"
          aria-label={`Delete course ${curso.nomeDoCurso}`}
          onclick={() => ondelete(curso)}
          class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs leading-none text-white hover:bg-red-700"
        >
          ×
        </button>
      </span>
    {:else}
      <span class="text-sm text-slate-500">No courses yet.</span>
    {/each}
  </div>
</section>
