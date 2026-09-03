(()=>{
  const root=document.documentElement;
  const button=document.getElementById('themeToggle');
  if(!button)return;
  function apply(theme){
    root.dataset.theme=theme;
    try{localStorage.setItem('foodRecallWallTheme',theme)}catch(_){}
    const isLight=theme==='light';
    button.setAttribute('aria-pressed',String(!isLight));
    button.setAttribute('aria-label',isLight?'Switch to dark mode':'Switch to light mode');
    const icon=button.querySelector('.theme-icon');
    const word=button.querySelector('.theme-word');
    if(icon)icon.textContent=isLight?'☾':'☀';
    if(word)word.textContent=isLight?'DARK':'LIGHT';
  }
  apply(root.dataset.theme||'light');
  button.addEventListener('click',()=>apply(root.dataset.theme==='light'?'dark':'light'));
})();
