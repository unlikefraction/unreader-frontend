// Drawing Tool Shortcuts Configuration
const DRAWING_SHORTCUTS = {
    'KeyV': 'cursor',
    'KeyR': 'rectangle', 
    'KeyA': 'arrow',
    'KeyL': 'line',
    'KeyE': 'eraser',
    'KeyP': 'pencil',
    'KeyH': 'highlighter',
    'KeyO': 'circle',
    'KeyT': 'text'
  };
  
  const AUDIO_SHORTCUTS = {
    'Space': 'playPause',
    'ArrowRight': 'forward',
    'ArrowLeft': 'rewind'
  };
  
  const SETTINGS = {
    enabled: true,
    preventInInputs: true
  };
  
  // Apply shortcuts
  document.addEventListener('keydown', (e) => {
    if (!SETTINGS.enabled) return;
    
    // Skip if user is typing in input fields
    if (SETTINGS.preventInInputs && isInputField(e.target)) return;
    
    // Handle reload shortcut
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      window.location.reload();
      return;
    }
    
    // Handle drawing tool shortcuts
    const toolClass = DRAWING_SHORTCUTS[e.code];
    if (toolClass) {
      e.preventDefault();
      const tool = document.querySelector(`.w-control.${toolClass}`);
      if (tool && window.drawer) {
        window.drawer.setActiveTool(tool);
      }
      return;
    }
    
    // Handle audio shortcuts
    const audioAction = AUDIO_SHORTCUTS[e.code];
    if (audioAction && window.audioSetup) {
      e.preventDefault();
      switch (audioAction) {
        case 'playPause':
          window.audioSetup.toggleAudio();
          break;
        case 'forward':
          window.audioSetup.forward();
          break;
        case 'rewind':
          window.audioSetup.rewind();
          break;
      }
    }
  });
  
  function isInputField(target) {
    const inputTypes = ['INPUT', 'TEXTAREA', 'SELECT'];
    return inputTypes.includes(target.tagName) || 
           target.contentEditable === 'true' ||
           target.isContentEditable ||
           target.classList.contains('annotation-text-editor');
  }