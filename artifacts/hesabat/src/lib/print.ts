export function printElementOnly() {
  const source = document.querySelector<HTMLElement>('[data-print-area]');
  if (!source) {
    window.print();
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('print-only-clone');
  clone.removeAttribute('data-print-area');
  document.body.appendChild(clone);
  document.body.classList.add('print-single-area');

  const cleanup = () => {
    document.body.classList.remove('print-single-area');
    clone.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.setTimeout(() => window.print(), 0);
  window.setTimeout(cleanup, 1200);
}
