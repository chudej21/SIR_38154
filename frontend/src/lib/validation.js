// Svelte action: shows the browser's form validation messages in English,
// regardless of the browser language. Usage: <input use:englishValidation ...>
export function englishValidation(node) {
  function onInvalid() {
    const v = node.validity;
    if (v.valueMissing) {
      node.setCustomValidity('Please fill out this field.');
    } else if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch || v.badInput) {
      node.setCustomValidity(`Please enter a whole number between ${node.min} and ${node.max}.`);
    }
  }

  function clear() {
    node.setCustomValidity('');
  }

  node.addEventListener('invalid', onInvalid);
  node.addEventListener('input', clear);
  node.addEventListener('change', clear);

  return {
    destroy() {
      node.removeEventListener('invalid', onInvalid);
      node.removeEventListener('input', clear);
      node.removeEventListener('change', clear);
    },
  };
}
