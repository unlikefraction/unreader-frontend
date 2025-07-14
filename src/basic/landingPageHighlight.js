document.addEventListener('DOMContentLoaded', () => {
    // 1. Identify your spans by data-index
    const indices = ['320', '321', '322'];
    const spans = indices.map(idx => 
      document.querySelector(`span.word[data-index="${idx}"]`)
    );
  
    // If any span is missing, bail out with a warning
    if (spans.some(s => !s)) {
      console.warn('One or more target spans not found. Check your data-index values.');
      return;
    }
  
    // 2. Create the wrapper div and insert before the first span
    const wrapper = document.createElement('div');
    wrapper.id = 'letsGo';
    spans[0].parentNode.insertBefore(wrapper, spans[0]);
  
    // Move each span into the wrapper
    spans.forEach(span => wrapper.appendChild(span));
  
    // 3. Define a check function for the "highlight" class
    function updateActivation() {
      const allHighlighted = spans.every(s => s.classList.contains('highlight'));
      if (allHighlighted) {
        wrapper.classList.add('activated');
      } else {
        wrapper.classList.remove('activated');
      }
    }
  
    // 4. Observe class changes on each span
    spans.forEach(span => {
      new MutationObserver(updateActivation)
        .observe(span, { attributes: true, attributeFilter: ['class'] });
    });
  
    // Initial check in case they’re already highlighted
    updateActivation();
  });
  