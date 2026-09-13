export function printElementOnly() {
  document.body.classList.add('print-single-area');

  const cleanup = () => {
    document.body.classList.remove('print-single-area');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
  window.setTimeout(cleanup, 1200);
}
