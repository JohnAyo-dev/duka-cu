
  try{
    var d = localStorage.getItem('local:duka-theme');
    if (d === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else if (d === 'light') document.documentElement.setAttribute('data-theme','light');
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme','dark');
  }catch(e){}
